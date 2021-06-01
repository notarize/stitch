import { DocumentNode, OperationDefinitionNode, SelectionSetNode, FieldNode } from "graphql";
import { print } from "graphql/language/printer";
import {
  makePattern,
  UnwrapDepPatternResults,
  Pattern,
  StrictPatternLookup,
} from "@notarize/stitch-core";

type Body = { query: string; variables?: unknown };
type With = { output: DocumentNode };
type MakeParams<D extends StrictPatternLookup<D>> = {
  deps?: D;
  depsWith?: { [key in keyof D]?: With };
  makeVariables?: (variableParams: { deps: UnwrapDepPatternResults<D> }) => unknown;
  document: DocumentNode;
};
type StampParams = {
  fetch: <R>(params: { body: Body }) => Promise<{ errors?: unknown[]; data?: R }>;
};

function getFieldId({ name, alias }: FieldNode): string {
  return alias?.value ?? name.value;
}

function mergeField(field: FieldNode, mergeFieldLookup: { [key: string]: FieldNode }) {
  const hasFieldToo = mergeFieldLookup[getFieldId(field)];
  if (!hasFieldToo?.selectionSet || !field.selectionSet) {
    return field;
  }
  return {
    ...field,
    selectionSet: mergeSelectionSet(field.selectionSet, hasFieldToo.selectionSet),
  };
}

function makeFieldLookup(selections: SelectionSetNode["selections"]) {
  return selections.reduce((accum, field) => {
    if (field.kind !== "Field") {
      throw new Error("Fragments not supported in selection sets.");
    }
    return {
      ...accum,
      [getFieldId(field)]: field,
    };
  }, {} as { [key: string]: FieldNode });
}

function mergeSelectionSet(oldSet: SelectionSetNode, mergeSet: SelectionSetNode): SelectionSetNode {
  const mergeFieldLookup = makeFieldLookup(mergeSet.selections);
  const oldFieldLookup = makeFieldLookup(oldSet.selections);
  const newFields = Object.keys(mergeFieldLookup)
    .filter((id) => {
      return !(id in oldFieldLookup);
    })
    .map((id) => mergeFieldLookup[id]);
  const newSelections = oldSet.selections
    .map((field) => mergeField(field as FieldNode, mergeFieldLookup))
    .concat(newFields);
  return {
    ...oldSet,
    selections: newSelections,
  };
}

function transformOpDefinition(
  oldDef: OperationDefinitionNode,
  mergeDef: OperationDefinitionNode,
): OperationDefinitionNode {
  return {
    ...oldDef,
    selectionSet: mergeSelectionSet(oldDef.selectionSet, mergeDef.selectionSet),
  };
}

function transformDocument(document: DocumentNode, depWith: With): DocumentNode {
  return {
    ...document,
    definitions: [
      transformOpDefinition(
        document.definitions[0] as OperationDefinitionNode,
        depWith.output.definitions[0] as OperationDefinitionNode,
      ),
    ],
  };
}

function makeGraphQLString(document: DocumentNode, depsWith: With[]): string {
  const newDocument = depsWith.reduce(transformDocument, document);
  return print(newDocument);
}

export function makePatternStamp({ fetch }: StampParams) {
  return Object.freeze({
    makePattern: <D extends StrictPatternLookup<D>, R>(patternParams: MakeParams<D>) => {
      return makePattern<D, R>({
        depsWith: patternParams.depsWith,
        deps: patternParams.deps,
        knit: async ({ deps, depsWith }) => {
          const body = {
            query: makeGraphQLString(patternParams.document, depsWith as With[]),
            variables: patternParams.makeVariables?.({ deps }),
          };
          const { data, errors } = await fetch<R>({
            deps,
            body,
          });
          if (errors?.length) {
            throw new Error(JSON.stringify(errors));
          }
          if (!data) {
            throw new Error("Missing GraphQL data.");
          }
          return data;
        },
      });
    },
  });
}
