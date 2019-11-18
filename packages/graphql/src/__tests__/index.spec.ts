import gql from "graphql-tag";
import { knitPattern } from "@notarize/stitch-core";

import { makePatternStamp } from "..";

describe("GraphQL Pattern Knit", () => {
  const doRequest = jest.fn(
    ({ body: { query } }: { body: any }): Promise<any> => {
      const isUserMutation = query.startsWith("mutation CreateUser");
      const data =
        isUserMutation && query.includes("twitter")
          ? {
              createUser: {
                id: "user123",
                firstName: "Linus",
                last: "Torvalds",
                social: { twitterHandle: "handleName", githubUrl: "https://github.com" },
              },
            }
          : isUserMutation
          ? { createUser: { id: "user123", social: { githubUrl: "https://github.com" } } }
          : { uploadDoc: { id: "doc123" } };
      return Promise.resolve({ data });
    },
  );

  const userMutation = gql`
    mutation CreateUser {
      createUser(name: "Linus") {
        id
        social {
          githubUrl
        }
      }
    }
  `;
  const uploadMutation = gql`
    mutation UploadDoc($title: String!, $userId: String!) {
      uploadDoc(owner: $userId, title: $title) {
        id
      }
    }
  `;

  const { makePattern } = makePatternStamp({
    fetch: doRequest,
  });

  it("should graphql requests.", async () => {
    const user = makePattern<{}, Response>({
      document: userMutation,
    });
    expect(await knitPattern(user)).toEqual({
      result: {
        createUser: {
          id: "user123",
          social: {
            githubUrl: "https://github.com",
          },
        },
      },
      deps: {},
    });
    expect(doRequest).toHaveBeenLastCalledWith({
      body: {
        query: expect.stringMatching(/^mutation CreateUser/),
      },
    });
  });

  it("should fragments from dep requests.", async () => {
    const user = makePattern({
      document: userMutation,
    });
    const upload = makePattern({
      makeVariables: ({ deps }) => {
        const { createUser } = deps.user as any;
        return {
          title: `${createUser.firstName}'s document`,
          owner: createUser.id,
        };
      },
      document: uploadMutation,
      deps: { user },
      depsWith: {
        user: {
          output: gql`
            {
              createUser {
                id
                firstName
                last: lastName
                social {
                  twitterHandle
                }
              }
            }
          `,
        },
      },
    });
    expect(await knitPattern(upload)).toEqual({
      result: {
        uploadDoc: {
          id: "doc123",
        },
      },
      deps: {
        user: { createUser: expect.any(Object) },
      },
    });
    const [
      [
        {
          body: { query: firstCallQuery },
        },
      ],
    ] = doRequest.mock.calls;
    expect(firstCallQuery).toContain("firstName");
    expect(firstCallQuery).toContain("last: lastName");
    expect(firstCallQuery).toMatch(/social {\n.*githubUrl.*\n.*twitterHandle.*\n.*}/);
    expect(doRequest).toHaveBeenLastCalledWith({
      body: {
        query: expect.stringMatching(/^mutation UploadDoc/),
        variables: {
          title: "Linus's document",
          owner: "user123",
        },
      },
    });
  });
});
