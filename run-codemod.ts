import fs from "fs";
import * as recast from "recast";
import * as t from "@babel/types";
import * as babelParser from "@babel/parser";
import globby from "globby";
import chalk from "chalk";
import codemods from "./codemods";

function transformFile(codemodName: string, filepath: string, source: string) {
  // Here, we are:
  // Parsing the source code string into an AST, using @babel/parser,
  // and wrapping that AST with a bunch of getter/setter/proxy stuff, using recast.
  //
  // Recast is a tool that wraps an AST such that it can track modifications to it,
  // and correlate those modifications with the location of the affected code in the input string.
  // Then, when you tell Recast to convert the modified AST back to code, it will not touch
  // the code formatting of the parts of the AST you didn't modify; it will only affect the formatting
  // of modified or added code, that was created by modifying the AST.
  //
  // Recast is often used in codemod tools because of this "formatting-preserving" behaviour.
  // However, if you use prettier on your codebase, you may not need to use Recast at all.
  // One other consideration when using prettier in your codebase is that the formatting for
  // modified/added code that Recast creates will likely not match prettier's formatting, so
  // you may wish to run prettier on the affected files after running a codemod.
  //
  // Because we are providing Recast with a custom parse function that uses Babel's parser,
  // the AST Recast gives us will be in the "@babel/parser" format, which differs slightly
  // from the "ESTree" spec used by Acorn, Spidermonkey, etc. The most notable difference is
  // that Babel's parser uses nodes like StringLiteral and NumericLiteral to represent strings
  // and numbers, instead of representing both with one combined "Literal" node type, as found
  // in the ESTree spec. In general, when working with codemods, it's good to be aware of
  // this different with literal nodes, because you could end up in a situation where your
  // code is expecting to find a StringLiteral node, but the AST contains Literal nodes
  // (or vice-versa).
  //
  // When using ASTExplorer.net, make sure to select "@babel/parser" as your parser.
  // You may also want to click the gear icon and change its options to match those specified below.
  //
  // The formal definition for @babel/parser's AST format is found here: https://github.com/babel/babel/blob/master/packages/babel-parser/ast/spec.md
  const ast: t.File = recast.parse(source, {
    parser: {
      parse(source: string) {
        // Specify a bunch of options for Babel so that it can parse almost anything
        // you're probably using in the wild. If you run into parse errors, try
        // following the instructions in the below comments to identify if any of
        // these options need to be modified.
        return babelParser.parse(source, {
          sourceFilename: filepath,
          allowAwaitOutsideFunction: true,
          allowImportExportEverywhere: true,
          allowReturnOutsideFunction: true,
          allowSuperOutsideMethod: true,
          allowUndeclaredExports: true,
          plugins: [
            // If you're using Flow instead of TypeScript, comment out "typescript"
            // and uncomment "flow" and "flowComments".
            "typescript",
            // "flow",
            // "flowComments",

            "jsx",

            "asyncDoExpressions",
            "asyncGenerators",
            "bigInt",
            "classPrivateMethods",
            "classPrivateProperties",
            "classProperties",
            "classStaticBlock",
            "decimal",

            // If decorators aren't working, try switching which of these two lines is uncommented
            // "decorators",
            "decorators-legacy",

            "doExpressions",
            "dynamicImport",
            "exportDefaultFrom",
            "exportNamespaceFrom",
            "functionBind",
            "functionSent",
            "importAssertions",
            "importMeta",
            "logicalAssignment",
            "moduleBlocks",
            "moduleStringNames",
            "nullishCoalescingOperator",
            "numericSeparator",
            "objectRestSpread",
            "optionalCatchBinding",
            "optionalChaining",
            "partialApplication",
            "privateIn",
            "throwExpressions",
            "topLevelAwait",

            // If you're using the pipeline operator, you'll have to specify which proposal you're using.
            // Comment/uncomment lines below as appropriate.
            // If unsure, check what's in your babel config.
            // ["pipelineOperator", {proposal: "minimal"}],
            ["pipelineOperator", { proposal: "fsharp" }],
            // ["pipelineOperator", {proposal: "hack"}],
            // ["pipelineOperator", {proposal: "smart"}],
          ],
        });
      },
    },
  });

  // `ast` is a File node. We want to pass the Program node to the codemod functions instead.
  const program = ast.program;

  const codemod = codemods[codemodName];
  if (!codemod) {
    throw new Error(
      `No such codemod: ${codemodName}. Valid codemod names: ${Object.keys(
        codemods
      ).join(", ")}.`
    );
  }

  codemod(program, filepath, source);

  const outputSource = recast.print(ast).code;
  return outputSource;
}

// Run this on the CLI with one required parameter and one optional parameter.
// - The required parameter is the name of the codemod.
// - The optional parameter is a glob of files to run the codemod against.
//   If omitted, it defaults to all js, jsx, ts, and tsx files in src.
function main() {
  // Work around xode bug; argv[2] is wrong
  process.argv.splice(1, 1);

  console.log(chalk.green("\n\n--- Starting codemod run. ---"));

  const codemodName = process.argv[2];
  if (!codemodName) {
    throw new Error(
      `You must specify a codemod to run as the first command-line argument. Valid codemod names: ${Object.keys(
        codemods
      ).join(", ")}.`
    );
  }

  const glob = process.argv[3] || "./src/**/*.{js,jsx,ts,tsx}";

  console.log(chalk.blue(`Searching for files matching: ${glob}`));
  const files = globby.sync(glob);

  console.log(
    chalk.yellow(
      `Found ${files.length} file${
        files.length === 1 ? "" : "s"
      } to run the codemod on${files.length === 0 ? "." : ":"}`
    )
  );

  if (files.length > 0) {
    console.log(
      chalk.gray(
        "- " +
          files.slice(0, 2).join("\n- ") +
          (files.length > 2 ? `\n - ...and ${files.length - 2} more` : "")
      )
    );
  }

  for (const file of files) {
    console.log(chalk.cyan("\nTransforming:"), file);

    const source = fs.readFileSync(file, "utf-8");
    console.log(chalk.magenta("--- Before: ---"));
    console.log(source.trim());
    const newSource = transformFile(codemodName, file, source);
    console.log(chalk.magenta("--- After: ---"));
    console.log(newSource.trim());
    console.log(chalk.magenta("------\n"));

    // Comment out the line below to not update the file. Useful for testing your codemod.
    fs.writeFileSync(file, newSource);
  }

  console.log(chalk.green("All done!"));
}

try {
  main();
} catch (err: any) {
  console.error(chalk.red("Codemod failed:"));
  console.error(err.stack);
}
