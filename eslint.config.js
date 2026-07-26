const foundryGlobals = [
  "game", "ui", "canvas", "Hooks", "CONFIG", "CONST", "foundry", "socketlib",
  "Roll", "ChatMessage", "Dialog", "PIXI", "Actor", "Item", "Scene", "Macro"
].reduce((acc, name) => Object.assign(acc, { [name]: "readonly" }), {});

const browserGlobals = [
  "window", "document", "navigator", "console", "setTimeout", "clearTimeout",
  "requestAnimationFrame", "HTMLElement", "Image", "File", "Blob", "CSS",
  "URL", "fetch", "Element"
].reduce((acc, name) => Object.assign(acc, { [name]: "readonly" }), {});

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...foundryGlobals, ...browserGlobals }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-dupe-class-members": "error",
      "no-const-assign": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      "no-constant-condition": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "require-atomic-updates": "warn"
    }
  }
];
