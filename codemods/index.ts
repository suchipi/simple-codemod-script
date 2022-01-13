import reactToStarImport from "./react-to-star-import";
import { Program } from "@babel/types";

// Each codemod in this object is expected to somehow modify the `ast` it receives (or its child nodes).
const codemods: {
  [key: string]: (ast: Program, filepath: string, source: string) => void;
} = {
  "react-to-star-import": reactToStarImport,
};

export default codemods;
