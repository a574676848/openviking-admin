import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import { createPortal } from "react-dom";
import {
  Network,
  ChevronDown,
  Maximize2,
  Check,
  Minimize2
} from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "var(--font-stack-sans)",
});

export const MermaidBlock = createReactBlockSpec(
  {
    type: "mermaid",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      code: { 
        default: "graph TD\n  A[Christmas] -->|Get money|\n  B(Go shopping)\n  B --> C{Let me think}\n  C -->|One| D[Laptop]\n  C -->|Two| E[iPhone]\n  C -->|Three| F[Car]" 
      },
      viewMode: { default: "split" },
      title: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const code = block.props.code as string;
      const viewMode = block.props.viewMode as string;
      const title = block.props.title as string;
      
      const [isMaximized, setIsMaximized] = useState(false);
      const [showViewMenu, setShowViewMenu] = useState(false);
      const diagramRef = useRef<HTMLDivElement>(null);
      const maximizedDiagramRef = useRef<HTMLDivElement>(null);
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
      
      const setViewMode = (newMode: string) => {
        editor.updateBlock(block, { props: { ...block.props, viewMode: newMode } });
      };
      
      const setTitle = (newTitle: string) => {
        editor.updateBlock(block, { props: { ...block.props, title: newTitle } });
      };

      useEffect(() => {
        if (viewMode === "code") return;
        
        const renderDiagram = async (ref: React.RefObject<HTMLDivElement | null>, suffix: string) => {
          if (!ref.current) return;
          try {
            const id = `mermaid-${block.id}-${suffix}`;
            const { svg } = await mermaid.render(id, code || "graph TD");
            if (ref.current) {
              ref.current.innerHTML = svg;
            }
          } catch (e) {
            if (ref.current) {
              ref.current.innerHTML = `<div class="text-[var(--danger)] p-4 text-sm font-mono flex items-center justify-center h-full">语法错误 / Syntax Error</div>`;
            }
          }
        };

        void renderDiagram(diagramRef, "inline");
        if (isMaximized) {
          void renderDiagram(maximizedDiagramRef, "maximized");
        }
      }, [code, viewMode, block.id, isMaximized]);

      const lines = code.split("\n");

      // Inlining everything to avoid component recreation and focus loss
      return (
        <div ref={containerRef} className="w-full">
          <div className="w-full flex flex-col border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--editor-surface)] shadow-sm font-sans my-6 group outline-none transition-colors duration-200">
            <div className={`flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] text-sm text-[var(--text-secondary)] select-none shrink-0`}>
              <div className="flex items-center gap-2 flex-1">
                <Network size={16} className="text-[var(--brand)] shrink-0" />
                <input
                  type="text"
                  placeholder="请输入标题"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] font-medium placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
                />
              </div>
              
              <div className="flex items-center gap-4">
                <div className="relative">
                  <button 
                    onClick={() => setShowViewMenu(!showViewMenu)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${showViewMenu ? 'bg-[var(--brand-muted)] text-[var(--brand)]' : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
                  >
                    视图 <ChevronDown size={14} className={`transform transition-transform duration-200 ${showViewMenu ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showViewMenu && (
                    <>
                      <div className="fixed inset-0 z-[100]" onClick={() => setShowViewMenu(false)}></div>
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-[var(--editor-surface)] border border-[var(--border)] rounded-lg shadow-xl z-[101] py-1.5 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                        <button 
                          onClick={() => { setViewMode("split"); setShowViewMenu(false); }}
                          className="flex items-center justify-between px-3.5 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left transition-colors"
                        >
                          展示代码和图表
                          {viewMode === "split" && <Check size={14} className="text-[var(--brand)]" />}
                        </button>
                        <button 
                          onClick={() => { setViewMode("code"); setShowViewMenu(false); }}
                          className="flex items-center justify-between px-3.5 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left transition-colors"
                        >
                          仅展示代码
                          {viewMode === "code" && <Check size={14} className="text-[var(--brand)]" />}
                        </button>
                        <button 
                          onClick={() => { setViewMode("graph"); setShowViewMenu(false); }}
                          className="flex items-center justify-between px-3.5 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-left transition-colors"
                        >
                          仅展示图表
                          {viewMode === "graph" && <Check size={14} className="text-[var(--brand)]" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex items-center gap-1 ml-1">
                  <button 
                    onClick={() => setIsMaximized(true)}
                    className="hover:text-[var(--brand)] hover:bg-[var(--brand-muted)] p-1.5 rounded-md transition-all"
                    title="全屏编辑"
                  >
                    <Maximize2 size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className={`flex bg-[var(--editor-surface)] min-h-[360px]`}>
              {(viewMode === "split" || viewMode === "code") && (
                <div className={`flex flex-col border-[var(--border)] bg-[var(--bg-muted)] ${viewMode === 'split' ? 'w-1/2 border-r' : 'w-full'}`}>
                  <div className="flex flex-1 relative font-mono text-sm overflow-hidden">
                    <div className="w-10 flex-shrink-0 flex flex-col items-end pt-4 pb-4 pr-3 select-none text-[var(--text-muted)] border-r border-[var(--border)] opacity-60 bg-[var(--bg-subtle)]">
                      {lines.map((_, i) => (
                        <div key={i} className="h-6 leading-6">{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      className="flex-1 w-full p-4 h-full min-h-full resize-none outline-none focus:outline-none focus:ring-0 border-none shadow-none bg-transparent leading-6 whitespace-pre font-mono text-[var(--text-primary)] overflow-auto"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => {
                        const target = e.target as HTMLTextAreaElement;

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

                        e.stopPropagation();
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const start = target.selectionStart;
                          const end = target.selectionEnd;
                          const newCode = code.substring(0, start) + "  " + code.substring(end);
                          setCode(newCode);
                          setTimeout(() => {
                            target.selectionStart = target.selectionEnd = start + 2;
                          }, 0);
                        }
                      }}
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
              
              {(viewMode === "split" || viewMode === "graph") && (
                <div className={`relative flex items-center justify-center p-6 bg-white dark:bg-black/20 ${viewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-auto`}>
                  <div ref={diagramRef} className="w-full h-full flex justify-center items-center" />
                </div>
              )}
            </div>
          </div>

          {isMaximized && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-8 animate-in fade-in duration-200">
              <div className="w-full h-full max-w-7xl bg-[var(--editor-surface)] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--border)] animate-in zoom-in-95 duration-200">
                <div className={`flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] text-sm text-[var(--text-secondary)] select-none shrink-0`}>
                  <div className="flex items-center gap-2 flex-1">
                    <Network size={16} className="text-[var(--brand)] shrink-0" />
                    <input
                      type="text"
                      placeholder="请输入标题"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] font-medium placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
                    />
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setIsMaximized(false)}
                      className="hover:text-[var(--brand)] hover:bg-[var(--brand-muted)] p-1.5 rounded-md transition-all"
                    >
                      <Minimize2 size={18} />
                    </button>
                  </div>
                </div>
                <div className={`flex bg-[var(--editor-surface)] flex-1 overflow-hidden`}>
                  <div className={`flex flex-col border-[var(--border)] bg-[var(--bg-muted)] ${viewMode === 'split' ? 'w-1/2 border-r' : 'w-full'}`}>
                    <div className="flex flex-1 relative font-mono text-sm overflow-hidden">
                      <div className="w-10 flex-shrink-0 flex flex-col items-end pt-4 pb-4 pr-3 select-none text-[var(--text-muted)] border-r border-[var(--border)] opacity-60 bg-[var(--bg-subtle)]">
                        {lines.map((_, i) => (
                          <div key={i} className="h-6 leading-6">{i + 1}</div>
                        ))}
                      </div>
                      <textarea
                        className="flex-1 w-full p-4 h-full min-h-full resize-none outline-none focus:outline-none focus:ring-0 border-none shadow-none bg-transparent leading-6 whitespace-pre font-mono text-[var(--text-primary)] overflow-auto"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => {
                          const target = e.target as HTMLTextAreaElement;

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

                          e.stopPropagation();
                          if (e.key === "Tab") {
                            e.preventDefault();
                            const start = target.selectionStart;
                            const end = target.selectionEnd;
                            const newCode = code.substring(0, start) + "  " + code.substring(end);
                            setCode(newCode);
                            setTimeout(() => {
                              target.selectionStart = target.selectionEnd = start + 2;
                            }, 0);
                          }
                        }}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                  <div className={`relative flex items-center justify-center p-6 bg-white dark:bg-black/20 ${viewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-auto`}>
                    <div ref={maximizedDiagramRef} className="w-full h-full flex justify-center items-center" />
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      );
    },
    toExternalHTML: (props) => (
      <pre>
        <code className="language-mermaid">{props.block.props.code as string}</code>
      </pre>
    )
  }
);
