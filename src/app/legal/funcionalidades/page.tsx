import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Funcionalidades",
  description: `Lista completa das funcionalidades da ${SITE_NAME}, a rede social de Feira de Santana.`,
  alternates: { canonical: "/legal/funcionalidades" },
};

type Feature = {
  title: string;
  items: string[];
};

const SECTIONS: Feature[] = [
  {
    title: "Conta e acesso",
    items: [
      "Cadastro com e-mail e senha",
      "Login e logout",
      "Recuperação de senha (esqueci minha senha) e redefinição",
      "Login social (Google) com conclusão de perfil",
      "Declaração de maioridade (18+) e aceite dos Termos de Uso no cadastro",
      "Username único, nome de exibição e foto de perfil",
      "Bairro opcional no cadastro (lista de bairros de Feira de Santana)",
      "Detecção automática de bairro por geolocalização (com permissão do usuário)",
    ],
  },
  {
    title: "Feed e publicações",
    items: [
      "Feed de posts da comunidade (bairro / rede local)",
      "Criar publicação com texto (até limite de caracteres do app)",
      "Caixa de composição expansível para textos longos",
      "Anexar fotos (com compressão e limites de quantidade)",
      "Anexar vídeo (quando habilitado) e áudio / gravação de áudio",
      "Legenda opcional em posts com mídia",
      "Menções a usuários com @ e autocomplete",
      "Visibilidade do post: público ou somente seguidores",
      "Categorias / flags de conteúdo (aviso, achados e perdidos, pedido de ajuda, publicidade, outro)",
      "Reações em posts",
      "Comentários em posts, respostas em thread e reações em comentários",
      "Compartilhar / republicar post no feed (repost) com comentário opcional",
      "Abertura do detalhe completo do post",
      "Contagem de comentários e atualização em tempo de uso",
      "Posts com data de expiração (quando aplicável)",
      "Pré-visualização de textos longos no feed com opção “Ver mais / Ver menos”",
      "Indicadores de post próprio e de visibilidade restrita",
    ],
  },
  {
    title: "Perfil",
    items: [
      "Perfil privado do usuário logado com layout editorial",
      "Foto de perfil (upload e alteração)",
      "Faixa colorida do nome com escolha de tema (bolinhas de cor)",
      "Descrição curta (tagline) editável",
      "Bio completa na aba Sobre",
      "Profissão ou adjetivo (headline) opcional",
      "Bairro editável com lista de bairros e salvamento",
      "Detecção automática de bairro via GPS (permissão no app + prompt do navegador)",
      "Contadores: entradas (posts), seguindo e seguidores",
      "Listas de seguidores e de quem o usuário segue",
      "Abas do perfil: Entradas, Sobre, Salas, Escrever, Config",
      "Álbum / carrossel de fotos no Sobre (quando disponível)",
      "Notas publicadas “em Sobre” (espaço tipo blog interno do perfil)",
      "Escrita de novas entradas a partir do perfil",
      "Configurações e sair da conta na seção Personalizar",
      "Visualização de perfil de outros usuários (diálogo / navegação)",
    ],
  },
  {
    title: "Privacidade e segurança",
    items: [
      "Perfil privado (conteúdo restrito a quem segue / é aceito)",
      "Aprovação manual de novos seguidores",
      "Ocultar lista de seguidores e/ou de quem você segue",
      "Ocultar bairro no perfil público",
      "Bloquear e desbloquear usuários",
      "Denunciar conteúdo ou usuários (sistema de reports)",
      "Moderação: avisos, suspensão e banimento (lado administrativo)",
      "Remoção de metadados de geolocalização de imagens no upload (privacidade)",
      "Exportação de dados da conta (LGPD)",
      "Solicitação e cancelamento de exclusão de conta (prazo de carência)",
      "Rate limiting e proteções de API contra abuso",
    ],
  },
  {
    title: "Relacionamentos sociais",
    items: [
      "Seguir usuários",
      "Solicitações de seguimento pendentes (quando a aprovação está ativa)",
      "Deixar de seguir",
      "Remover seguidores (gestão na conta)",
      "Bloqueio mútuo de interações conforme regras de privacidade",
    ],
  },
  {
    title: "Salas",
    items: [
      "Salas de conversa temáticas / locais",
      "Participação em salas e visualização de membros",
      "Mensagens e interações dentro das salas (conforme regras da sala)",
      "Enquetes em salas (quando habilitado pelo backend)",
      "Gestão administrativa de salas (criar, moderar, membros)",
    ],
  },
  {
    title: "Mensagens diretas (DMs)",
    items: [
      "Conversas privadas entre usuários",
      "Lista de conversas e abertura de thread",
      "Envio de mensagens de texto",
      "Indicadores de conversa ativa no app",
    ],
  },
  {
    title: "Descoberta e cidade",
    items: [
      "Aba Descobrir para explorar pessoas e conteúdo",
      "Atualizações da cidade (city updates) publicadas pela curadoria/admin",
      "Tendências da cidade (city trends), quando disponíveis",
      "Busca e sugestão de usuários (nome e username)",
    ],
  },
  {
    title: "Notificações e avisos",
    items: [
      "Contagem de notificações não lidas",
      "Listagem e leitura de notificações",
      "Banners / avisos oficiais do app (admin), com opção de ocultar",
      "Push notifications e inscrição (quando o usuário autoriza)",
      "Banner de status offline (sem conexão)",
    ],
  },
  {
    title: "Aplicativo e experiência",
    items: [
      "Interface web responsiva (mobile e desktop)",
      "PWA: instalação, manifest e service worker / página offline",
      "Navegação por abas: Feed, Salas, Mensagens, Descobrir, Perfil",
      "Tema visual claro editorial (papel, tipografia serifada nos títulos)",
      "Pedido de permissão de localização no app (banner explicativo + botões)",
      "Toasts de feedback (sucesso, erro, informação)",
      "Indicadores de carregamento e skeletons",
    ],
  },
  {
    title: "Ferramentas de escrita e mídia",
    items: [
      "Editor de texto no perfil / escrever (formatação conforme recursos ativos)",
      "Reescrita assistida por IA (melhorar, esclarecer, tom de bairro, corrigir), quando disponível",
      "Upload de imagens com validação de tipo e tamanho",
      "Compressão de imagens para o feed",
      "Players de vídeo e áudio nos posts",
      "Galeria e visualização ampliada de fotos",
    ],
  },
  {
    title: "Administração (equipe)",
    items: [
      "Painel admin",
      "Gestão de usuários (moderação, suspensão, banimento)",
      "Gestão de denúncias (reports)",
      "Gestão de banners / avisos do app",
      "Gestão de salas e membros",
      "Publicação e curadoria de atualizações da cidade",
    ],
  },
  {
    title: "Legal e transparência",
    items: [
      "Termos de Uso",
      "Política de Privacidade (seção LGPD nos Termos)",
      "Esta página de Funcionalidades (lista do que o app oferece)",
      "Acesso aos documentos legais pelo cadastro e pelas Configurações",
    ],
  },
];

export default function FuncionalidadesPage() {
  const total = SECTIONS.reduce((acc, s) => acc + s.items.length, 0);

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#D96C4A]">
          Legal · Documentação
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#1A1A1A]">
          Funcionalidades
        </h1>
        <p className="text-[15px] sm:text-base leading-relaxed text-[#4A4A4A] max-w-2xl">
          Lista descritiva do que a <strong className="font-semibold text-[#1A1A1A]">{SITE_NAME}</strong>{" "}
          oferece hoje: a rede social voltada aos bairros de Feira de Santana (BA). Esta página
          serve para transparência com usuários, parceiros e obrigações de informação — não
          substitui os{" "}
          <span className="text-[#1A1A1A]">Termos de Uso</span> nem a política de privacidade.
        </p>
        <p className="text-xs text-[#4A4A4A]/60">
          {SECTIONS.length} categorias · {total} itens descritos · atualizado conforme o produto
          em produção (algumas funções podem depender de flags, limites do plano ou moderação).
        </p>
      </header>

      <div className="space-y-8">
        {SECTIONS.map((section, idx) => (
          <section
            key={section.title}
            className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm"
            aria-labelledby={`sec-${idx}`}
          >
            <h2
              id={`sec-${idx}`}
              className="font-serif text-xl font-medium text-[#1A1A1A] mb-3 flex items-baseline gap-2"
            >
              <span className="text-sm font-sans font-semibold text-[#D96C4A] tabular-nums">
                {String(idx + 1).padStart(2, "0")}
              </span>
              {section.title}
            </h2>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-sm leading-relaxed text-[#3A3A3A]"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]/80"
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] p-4 sm:p-5 text-sm text-[#4A4A4A] leading-relaxed">
        <p className="font-medium text-[#1A1A1A] mb-1">Observações</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Recursos de vídeo, upload de mídia ou IA podem estar limitados ou desativados em
            ambientes “light” / beta.
          </li>
          <li>
            A geolocalização só é usada com permissão explícita; o app não grava coordenadas no
            perfil — apenas o bairro que você confirma.
          </li>
          <li>
            Funcionalidades administrativas são exclusivas da equipe autorizada.
          </li>
        </ul>
        <p className="mt-4 text-xs">
          Documentos relacionados: use{" "}
          <Link href="/" className="underline underline-offset-2 text-[#0A4D5C] hover:text-[#D96C4A]">
            Configurações → Legal
          </Link>{" "}
          no app para abrir Termos de Uso e Política de Privacidade.
        </p>
      </aside>
    </article>
  );
}
