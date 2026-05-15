import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { useState, useCallback, useRef, useEffect } from "react";
import { Check, Copy, ChevronDown, MoreHorizontal } from "lucide-react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/themes/prism.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";

const LANGUAGES = [
  { value: "plain", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
];

export const CustomCodeBlock = createReactBlockSpec(
  {
    type: "procode",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      title: { default: "" },
      language: { default: "plain" },
      code: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const code = block.props.code as string;
      const language = block.props.language as string;
      const title = block.props.title as string;

      const [showLangMenu, setShowLangMenu] = useState(false);
      const [searchLang, setSearchLang] = useState("");
      const [showSettingsMenu, setShowSettingsMenu] = useState(false);
      const [copied, setCopied] = useState(false);
      const containerRef = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const timer = setTimeout(() => {
          try {
            if (editor.getTextCursorPosition()?.block.id === block.id) {
              const textarea = containerRef.current?.querySelector('textarea');
              if (textarea) textarea.focus();
            }
          } catch(e) {}
        }, 50);
        return () => clearTimeout(timer);
      }, [block.id, editor]);

      const setCode = (newCode: string) => {
        editor.updateBlock(block, { props: { ...block.props, code: newCode } });
      };

      const setLanguage = (newLang: string) => {
        editor.updateBlock(block, { props: { ...block.props, language: newLang } });
        setShowLangMenu(false);
      };

      const setTitle = (newTitle: string) => {
        editor.updateBlock(block, { props: { ...block.props, title: newTitle } });
      };

      const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          setShowSettingsMenu(false);
        });
      }, [code]);

      const highlightWithPrism = (codeStr: string) => {
        const langDef = Prism.languages[language] || Prism.languages.plain || {};
        if (!Prism.languages[language]) {
            return codeStr;
        }
        return Prism.highlight(codeStr, langDef, language);
      };

      const currentLangLabel = LANGUAGES.find((l) => l.value === language)?.label || "Plain Text";

      return (
        <div ref={containerRef} className="w-full flex flex-col border border-[var(--border)] rounded-xl overflow-visible bg-[var(--editor-surface)] shadow-sm font-sans my-4 group outline-none transition-colors duration-200">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] bg-[var(--bg-subtle)] text-sm text-[var(--text-secondary)]">
            <input
              type="text"
              placeholder="请输入标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] font-medium placeholder:text-[var(--text-muted)]"
            />
            <div className="flex items-center gap-2">
              {/* Language Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all font-medium hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  {currentLangLabel} <ChevronDown size={14} className={`transform transition-transform duration-200 ${showLangMenu ? 'rotate-180' : ''}`} />
                </button>
                
                {showLangMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => { setShowLangMenu(false); setSearchLang(""); }}></div>
                    <div className="absolute right-0 top-full mt-1.5 w-48 max-h-[320px] bg-[var(--editor-surface)] border border-[var(--border)] rounded-lg shadow-xl z-[101] flex flex-col animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                      <div className="p-2 border-b border-[var(--border)] bg-[var(--editor-surface)] shrink-0">
                        <input
                          type="text"
                          autoFocus
                          placeholder="搜索语言..."
                          value={searchLang}
                          onChange={(e) => setSearchLang(e.target.value)}
                          className="w-full bg-[var(--bg-muted)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)] transition-colors"
                        />
                      </div>
                      <div className="overflow-y-auto py-1.5">
                        {LANGUAGES.filter(l => l.label.toLowerCase().includes(searchLang.toLowerCase()) || l.value.toLowerCase().includes(searchLang.toLowerCase())).map((lang) => (
                          <button
                            key={lang.value}
                            onClick={() => { setLanguage(lang.value); setSearchLang(""); }}
                            className={`w-full flex items-center justify-between px-3.5 py-1.5 hover:bg-[var(--bg-hover)] text-left transition-colors ${language === lang.value ? 'text-[var(--brand)] font-medium bg-[var(--brand-muted)]' : 'text-[var(--text-primary)]'}`}
                          >
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Settings / Copy */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-md transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <MoreHorizontal size={16} />
                </button>
                {showSettingsMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowSettingsMenu(false)}></div>
                    <div className="absolute right-0 top-full mt-1.5 w-32 bg-[var(--editor-surface)] border border-[var(--border)] rounded-lg shadow-xl z-[101] py-1.5 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-3.5 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left transition-colors"
                      >
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        {copied ? "已复制" : "复制代码"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Editor Area */}
          <div className="bg-[var(--bg-muted)] rounded-b-xl overflow-hidden flex text-[13px] font-mono leading-[21px]">
            {/* Line Numbers */}
            <div className="w-10 flex-shrink-0 flex flex-col items-end pt-4 pb-4 pr-3 select-none text-[var(--text-muted)] border-r border-[var(--border)] opacity-60 bg-[var(--bg-subtle)]">
               {code.split("\n").map((_, i) => (
                  <div key={i} className="h-[21px]">{i + 1}</div>
               ))}
            </div>

            <div className="flex-1 overflow-x-auto"
              onKeyDownCapture={(e) => {
                const target = e.target as HTMLTextAreaElement;
                if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") return;

                if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                  if (target.selectionStart === 0 && target.selectionEnd === target.value.length) {
                    e.preventDefault();
                    e.stopPropagation();
                    target.blur();
                    editor.focus();
                    if ((editor as any)._tiptapEditor) {
                      (editor as any)._tiptapEditor.commands.selectAll();
                    }
                    return;
                  }
                }

                if ((e.key === "Backspace" || e.key === "Delete") && target.value.length === 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  editor.removeBlocks([block]);
                  editor.focus();
                  return;
                }
              }}
            >
              <Editor
                value={code}
                onValueChange={setCode}
                highlight={highlightWithPrism}
                padding={16}
                textareaClassName="focus:outline-none focus:ring-0 border-none outline-none shadow-none"
                style={{
                  fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                  fontSize: 13,
                  lineHeight: '21px',
                  backgroundColor: 'transparent',
                  minHeight: '100px',
                }}
                className="editor-container text-[var(--text-primary)] outline-none"
              />
            </div>
          </div>
        </div>
      );
    },
    toExternalHTML: (props) => (
      <pre>
        <code className={`language-${props.block.props.language || "plain"}`}>
          {props.block.props.code as string}
        </code>
      </pre>
    )
  }
);
