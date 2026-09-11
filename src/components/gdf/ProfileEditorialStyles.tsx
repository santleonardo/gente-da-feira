"use client";

/**
 * Estilos editoriais do perfil (tipografia, responsive, content-visibility).
 * Injetado uma vez por página de perfil — evita @import de fontes no render
 * e duplicação de <style> entre ProfileView e UserProfileDialog.
 */
const CSS = `
.profile-blog,.upd-blog{--paper:#f9f8f6;--ink:#1a1a1a;--ink-light:#4a4a4a;--accent:#d96c4a;font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;max-width:100%;min-width:0;overflow-x:hidden;overscroll-behavior-x:none}
.profile-blog .font-serif,.upd-blog .font-serif{font-family:"Playfair Display",ui-serif,Georgia,Cambria,"Times New Roman",Times,serif}
.editor-content h1,.post-content h1{font-family:"Playfair Display",ui-serif,Georgia,serif;font-size:1.35rem;font-weight:500;line-height:1.25;margin:.45em 0 .2em;letter-spacing:-.02em;word-break:break-word}
.editor-content h2,.post-content h2{font-family:"Playfair Display",ui-serif,Georgia,serif;font-size:1.15rem;font-weight:500;line-height:1.3;margin:.35em 0 .15em;word-break:break-word}
.editor-content h3,.post-content h3{font-size:1rem;font-weight:600;line-height:1.3;margin:.3em 0 .12em}
.editor-content h4,.post-content h4{font-size:.95rem;font-weight:600;line-height:1.3}
@media (min-width:640px){.editor-content h1,.post-content h1{font-size:1.65rem}.editor-content h2,.post-content h2{font-size:1.3rem}.editor-content h3,.post-content h3{font-size:1.05rem}}
.editor-content b,.editor-content strong,.post-content b,.post-content strong{font-weight:700}
.editor-content i,.editor-content em,.post-content i,.post-content em{font-style:italic}
.editor-content u,.post-content u{text-decoration:underline;text-underline-offset:2px}
.editor-content s,.editor-content strike,.post-content s,.post-content strike{text-decoration:line-through}
.editor-content a,.post-content a,.upd-blog .post-content a{color:#0a4d5c;text-decoration:underline;text-underline-offset:2px}
.editor-content a:hover,.post-content a:hover,.upd-blog .post-content a:hover{color:#d96c4a}
.editor-content ul,.post-content ul{list-style:disc;padding-left:1.25em;margin:.35em 0}
.editor-content ol,.post-content ol{list-style:decimal;padding-left:1.25em;margin:.35em 0}
@media (min-width:640px){.editor-content ul,.post-content ul,.editor-content ol,.post-content ol{padding-left:1.5em}}
.editor-content li,.post-content li{margin:.12em 0}
.editor-content blockquote,.post-content blockquote{border-left:3px solid #d96c4a;padding-left:.75em;margin:.5em 0;color:#4a4a4a;font-style:italic;font-family:"Playfair Display",ui-serif,Georgia,serif}
.editor-content pre,.post-content pre{background:#f3f4f6;border-radius:8px;padding:.5em .75em;margin:.3em 0;overflow-x:auto;-webkit-overflow-scrolling:touch;font-size:.85em;max-width:100%}
.editor-content code,.post-content code{background:#f3f4f6;border-radius:4px;padding:.1em .3em;font-size:.9em;word-break:break-word}
.editor-content hr,.post-content hr{border:none;border-top:1px solid rgba(26,26,26,.12);margin:.75em 0}
.editor-content div,.post-content div{margin:0}
.editor-content p,.post-content p{margin:.3em 0}
.profile-blog img,.profile-blog video,.upd-blog img,.upd-blog video{max-width:100%;height:auto}
.profile-blog pre,.profile-blog code{max-width:100%;overflow-x:auto}
.upd-post-card,.profile-blog article.group{content-visibility:auto;contain-intrinsic-size:auto 280px}
.upd-hero-photo{width:min(90vw,calc(100vw - 2.5rem));max-width:440px;margin-left:auto;margin-right:auto}
.profile-stats-row{display:flex;width:100%;min-width:0;overflow:hidden}
.profile-stats-row>*{flex:1 1 0;min-width:0}
@media (max-width:639px){.profile-blog .editor-content,.profile-blog .post-content{font-size:.95rem;line-height:1.55}}
`;

export function ProfileEditorialStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
