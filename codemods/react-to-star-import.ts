import * as t from "@babel/types";

// This codemod looks for this:
//
// import React from "react";
//
// And changes it to this:
//
// import * as React from "react";
//
export default function codemod(
  ast: t.Program,
  filepath: string,
  source: string
) {
  // You could use https://babeljs.io/docs/en/babel-traverse instead of these for loops and if loops
  for (const statement of ast.body) {
    if (statement.type === "ImportDeclaration") {
      if (
        statement.source.type === "StringLiteral" &&
        statement.source.value === "react"
      ) {
        for (let i = 0; i < statement.specifiers.length; i++) {
          const specifier = statement.specifiers[i];

          if (specifier.type === "ImportDefaultSpecifier") {
            const localIdent = specifier.local;

            // Here, we use the node builder functions from @babel/types to create an ImportNamespaceSpecifier node.
            // For creating more complicated AST node structures, you might want to use https://babeljs.io/docs/en/babel-template
            const newSpecifier = t.importNamespaceSpecifier(localIdent);
            statement.specifiers[i] = newSpecifier;
          }
        }
      }
    }
  }
}
