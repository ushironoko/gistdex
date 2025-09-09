// Node type definitions for each language
// Extracted from Tree-sitter parser documents and node-types.json

import type { SyntaxNode } from "web-tree-sitter";

export const LANGUAGE_NODE_TYPES = {
  javascript: {
    functions: [
      "function_declaration",
      "function_expression",
      "arrow_function",
    ],
    classes: ["class_declaration"],
    methods: ["method_definition"],
    imports: ["import_statement"],
    variables: ["variable_declaration", "lexical_declaration"],
  },
  typescript: {
    functions: [
      "function_declaration",
      "function_expression",
      "arrow_function",
    ],
    classes: ["class_declaration"],
    methods: ["method_definition"],
    interfaces: ["interface_declaration"],
    types: ["type_alias_declaration"],
    imports: ["import_statement"],
    variables: ["variable_declaration", "lexical_declaration"],
  },
  tsx: {
    functions: [
      "function_declaration",
      "function_expression",
      "arrow_function",
    ],
    classes: ["class_declaration"],
    methods: ["method_definition"],
    interfaces: ["interface_declaration"],
    types: ["type_alias_declaration"],
    imports: ["import_statement"],
    variables: ["variable_declaration", "lexical_declaration"],
    jsx: ["jsx_element", "jsx_self_closing_element", "jsx_fragment"],
  },
  python: {
    functions: ["function_definition"],
    classes: ["class_definition"],
    methods: ["function_definition"], // Methods inside classes are also function_definition
    imports: ["import_statement", "import_from_statement"],
    variables: ["assignment"], // Python variable assignment
  },
  go: {
    functions: ["function_declaration"],
    methods: ["method_declaration"],
    types: ["type_declaration"],
    imports: ["import_declaration"],
    variables: [
      "var_declaration",
      "const_declaration",
      "short_var_declaration",
    ],
  },
  rust: {
    functions: ["function_item"],
    structs: ["struct_item"],
    impls: ["impl_item"],
    traits: ["trait_item"],
    imports: ["use_declaration"],
    variables: ["let_declaration"],
  },
  java: {
    functions: ["method_declaration"],
    classes: ["class_declaration"],
    interfaces: ["interface_declaration"],
    imports: ["import_declaration"],
    variables: ["local_variable_declaration"],
  },
  ruby: {
    functions: ["method"],
    classes: ["class"],
    modules: ["module"],
    imports: ["require", "load"],
    variables: ["assignment"],
  },
  c: {
    functions: ["function_definition"],
    structs: ["struct_specifier"],
    enums: ["enum_specifier"],
    typedefs: ["type_definition"],
    includes: ["preproc_include"],
    variables: ["declaration"],
  },
  cpp: {
    functions: ["function_definition"],
    classes: ["class_specifier"],
    structs: ["struct_specifier"],
    namespaces: ["namespace_definition"],
    templates: ["template_declaration"],
    includes: ["preproc_include"],
    variables: ["declaration"],
  },
  html: {
    elements: ["element"],
    scripts: ["script_element"],
    styles: ["style_element"],
  },
  css: {
    rules: ["rule_set"],
    media: ["media_statement"],
    keyframes: ["keyframes_statement"],
    imports: ["import_statement"],
  },
  bash: {
    functions: ["function_definition"],
    commands: ["command"],
    variables: ["variable_assignment"],
  },
  vue: {
    templates: ["template_element"],
    scripts: ["script_element"],
    styles: ["style_element"],
    components: ["component"],
    directives: ["directive_attribute"],
    interpolations: ["interpolation"],
  },
} as const;

// Collect all boundary node types
export const createBoundaryNodeTypes = (language: string): Set<string> => {
  const nodeTypes = new Set<string>();
  const langConfig =
    LANGUAGE_NODE_TYPES[language as keyof typeof LANGUAGE_NODE_TYPES];

  if (!langConfig) {
    // Use default (JavaScript)
    const defaultConfig = LANGUAGE_NODE_TYPES.javascript;
    Object.values(defaultConfig)
      .flat()
      .forEach((type) => {
        nodeTypes.add(type);
      });
    return nodeTypes;
  }

  Object.values(langConfig)
    .flat()
    .forEach((type) => {
      nodeTypes.add(type);
    });
  return nodeTypes;
};

// Language-specific node name extraction
export const createNodeNameExtractor = (language: string) => {
  return (node: SyntaxNode): string | undefined => {
    // Check common name field
    const nameField = node.childForFieldName?.("name");
    if (nameField?.text) {
      return nameField.text;
    }

    // Language-specific processing
    switch (language) {
      case "javascript":
      case "typescript":
      case "tsx":
        // For arrow functions, get name from parent variable_declarator
        if (node.type === "arrow_function") {
          const parent = node.parent;
          if (parent?.type === "variable_declarator") {
            const idNode = parent.childForFieldName("name");
            if (idNode?.text) {
              return idNode.text;
            }
          }
        }
        // For methods, get name from key field
        if (node.type === "method_definition") {
          const keyNode = node.childForFieldName("key");
          if (keyNode?.text) {
            return keyNode.text;
          }
        }
        break;

      case "python":
        // For Python, name field is used in most cases
        break;

      case "go":
        // For Go method_declaration
        if (node.type === "method_declaration") {
          const nameNode = node.childForFieldName("name");
          if (nameNode?.text) {
            return nameNode.text;
          }
        }
        break;

      case "rust":
        // For Rust function_item
        if (node.type === "function_item") {
          const nameNode = node.childForFieldName("name");
          if (nameNode?.text) {
            return nameNode.text;
          }
        }
        break;

      case "java":
        // For Java method_declaration
        if (node.type === "method_declaration") {
          const nameNode = node.childForFieldName("name");
          if (nameNode?.text) {
            return nameNode.text;
          }
        }
        break;
    }

    // Fallback: look for identifier node
    const identifierChild = node.children?.find?.(
      (child) => child.type === "identifier",
    );
    return identifierChild?.text;
  };
};

// Language-specific modifier node types that should be included with their children
export const LANGUAGE_MODIFIER_NODES: Record<string, string[]> = {
  javascript: ["export_statement"],
  typescript: ["export_statement"],
  tsx: ["export_statement"],
  python: ["decorated_definition"], // @decorator patterns
  go: [], // Go includes modifiers in function_declaration
  rust: ["visibility_modifier"], // pub modifier
  java: ["modifiers"], // public, private, static, etc.
  ruby: [], // Ruby doesn't have export-like modifiers
  c: [], // C includes modifiers in function_definition
  cpp: [], // C++ includes modifiers in function_definition
  html: [],
  css: [],
  bash: [],
};

// Check if a parent node is a modifier that should be included
export const isModifierNode = (
  parentType: string | undefined,
  language: string,
): boolean => {
  if (!parentType) return false;

  const modifiers = LANGUAGE_MODIFIER_NODES[language] || [];

  return modifiers.includes(parentType);
};
