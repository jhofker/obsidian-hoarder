import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

// Eta template tag highlighting via CM6 decorations
const etaOutputTag = Decoration.mark({ class: "hoarder-eta-output" });
const etaControlTag = Decoration.mark({ class: "hoarder-eta-control" });
const yamlKey = Decoration.mark({ class: "hoarder-yaml-key" });
const yamlFrontmatterDelim = Decoration.mark({ class: "hoarder-yaml-delim" });
const markdownHeading = Decoration.mark({ class: "hoarder-md-heading" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // YAML frontmatter delimiter
    if (text === "---") {
      builder.add(line.from, line.to, yamlFrontmatterDelim);
      continue;
    }

    // Markdown headings
    if (/^#{1,6}\s/.test(text)) {
      builder.add(line.from, line.to, markdownHeading);
      continue;
    }

    // YAML keys (word followed by colon at start of line, but not inside Eta tags)
    const yamlMatch = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (yamlMatch && !text.includes("<%")) {
      builder.add(line.from, line.from + yamlMatch[1].length + 1, yamlKey);
    }

    // Eta tags within the line
    const tagRegex = /<%[=_-]?[\s\S]*?[_-]?%>/g;
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const isOutput = match[0].startsWith("<%=");
      builder.add(from, to, isOutput ? etaOutputTag : etaControlTag);
    }
  }

  return builder.finish();
}

const etaHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const editorTheme = EditorView.theme({
  "&": {
    fontSize: "var(--font-ui-smaller)",
    minHeight: "500px",
    maxHeight: "600px",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "var(--radius-s)",
    backgroundColor: "var(--background-primary)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-monospace)",
  },
  ".cm-content": {
    padding: "var(--size-4-2)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background-secondary)",
    borderRight: "1px solid var(--background-modifier-border)",
    color: "var(--text-faint)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-normal)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused": {
    outline: "none",
    boxShadow: "0 0 0 2px var(--background-modifier-border-focus)",
  },
});

export function createTemplateEditor(
  container: HTMLElement,
  initialValue: string,
  onChange: (value: string) => void
): EditorView {
  const view = new EditorView({
    doc: initialValue,
    extensions: [
      EditorView.lineWrapping,
      editorTheme,
      etaHighlightPlugin,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    ],
    parent: container,
  });
  return view;
}

export function setEditorValue(view: EditorView, value: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}
