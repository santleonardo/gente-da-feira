import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { TERMS_VERSION, TERMS_DATE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: `Política de Privacidade e proteção de dados pessoais (LGPD) da ${SITE_NAME}.`,
  alternates: { canonical: "/legal/privacidade" },
};

const DATA_TABLE: { dado: string; finalidade: string; base: string; onde: string }[] = [
  {
    dado: "Nome, nome de usuário, e-mail, senha (criptografada)",
    finalidade: "Criar e proteger a conta, permitir login",
    base: "Contrato (art. 7º, V)",
    onde: "Cadastro, login, recuperação de senha, perfil",
  },
  {
    dado: "Bairro informado",
    finalidade: "Conectar a vizinhos e salas locais",
    base: "Contrato (art. 7º, V)",
    onde: "Cadastro, Personalizar perfil, perfil público (se não oculto)",
  },
  {
    dado: "Conteúdo publicado (posts, comentários, fotos, vídeos, mensagens)",
    finalidade: "Operar o feed, salas, DMs e demais funções",
    base: "Contrato (art. 7º, V)",
    onde: "Feed, detalhe do post, Escrever, Sobre, Salas, Mensagens",
  },
  {
    dado: "Endereço IP e registros de acesso",
    finalidade: "Segurança, prevenção a fraude, obrigação legal (Marco Civil)",
    base: "Obrigação legal (art. 7º, II) e legítimo interesse (art. 7º, IX)",
    onde: "Servidor (sem tela de usuário); retenção mínima descrita nos Termos",
  },
  {
    dado: "Token de notificação push",
    finalidade: "Enviar avisos sobre interações na conta",
    base: "Consentimento (art. 7º, I)",
    onde: "Permissão do sistema / notificações do app",
  },
  {
    dado: "Coordenadas GPS (uso pontual)",
    finalidade: "Sugerir bairro em Feira de Santana; não são gravadas no perfil",
    base: "Consentimento no clique (art. 7º, I)",
    onde: "Banner de localização, Detectar bairro (cadastro e perfil)",
  },
];

const RIGHTS: { right: string; how: string }[] = [
  {
    right: "Confirmação da existência de tratamento e acesso aos dados",
    how: "E-mail do canal LGPD e, quando disponível, exportação pela conta",
  },
  {
    right: "Correção de dados incompletos, inexatos ou desatualizados",
    how: "Editar perfil (nome de exibição, bio, tagline, headline, bairro, foto)",
  },
  {
    right: "Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos",
    how: "Pedido pelo canal LGPD; exclusão de conta no app",
  },
  {
    right: "Portabilidade dos dados",
    how: "Exportação de dados da conta (Configurações / Conta), quando disponível",
  },
  {
    right: "Eliminação de dados tratados com base em consentimento",
    how: "Revogar push/GPS; pedido pelo canal; exclusão de conta",
  },
  {
    right: "Informação sobre compartilhamento e sobre não consentir",
    how: "Esta página e os Termos de Uso (Seções 10 e 19)",
  },
  {
    right: "Revogação do consentimento",
    how: "Desativar notificações; recusar localização; “Agora não” no banner",
  },
];

const PRODUCT_CONTROLS: { title: string; where: string }[] = [
  { title: "Perfil privado", where: "Configurações → Privacidade" },
  { title: "Aprovar seguidores manualmente", where: "Configurações → Privacidade" },
  { title: "Ocultar lista de seguidores / seguindo", where: "Configurações → Privacidade" },
  { title: "Ocultar bairro no perfil público", where: "Configurações → Privacidade" },
  { title: "Bloquear usuários", where: "Perfis e fluxos de bloqueio" },
  { title: "Denunciar conteúdo ou contas", where: "Posts, comentários, perfis, mensagens" },
  { title: "Exportar dados da conta", where: "Configurações → Conta" },
  { title: "Solicitar exclusão de conta", where: "Configurações → Conta" },
];

const LGPD_MAP: { area: string; artigo: string; detalhe: string }[] = [
  {
    area: "Cadastro e login",
    artigo: "Arts. 6º, 7º, V e 9º",
    detalhe: "Ciência dos Termos/Privacidade; dados de conta para execução do serviço",
  },
  {
    area: "Perfil, bio, bairro, foto",
    artigo: "Arts. 6º e 18 (correção)",
    detalhe: "Minimização e atualização pelo próprio titular na interface",
  },
  {
    area: "Geolocalização",
    artigo: "Art. 7º, I (consentimento)",
    detalhe: "Só após gesto do usuário; conversão para bairro; sem armazenar coordenadas no perfil",
  },
  {
    area: "Feed, comentários, reações, DMs, salas",
    artigo: "Art. 7º, V",
    detalhe: "Tratamento necessário à execução das funcionalidades sociais",
  },
  {
    area: "Notificações push",
    artigo: "Art. 7º, I",
    detalhe: "Dependem de permissão do dispositivo/usuário",
  },
  {
    area: "Logs de IP e acesso",
    artigo: "Arts. 7º, II e IX; Marco Civil",
    detalhe: "Segurança e obrigação legal; retenção mínima prevista nos Termos",
  },
  {
    area: "Moderação, bloqueio, denúncia, rate limit",
    artigo: "Art. 7º, IX",
    detalhe: "Legítimo interesse em segurança e integridade da comunidade",
  },
  {
    area: "Remoção de GPS de imagens no upload",
    artigo: "Arts. 6º (prevenção/segurança)",
    detalhe: "Reduz dado sensível de localização embutido em arquivos",
  },
  {
    area: "Exportar / excluir conta",
    artigo: "Arts. 15, 16 e 18",
    detalhe: "Acesso, portabilidade e eliminação, com ressalvas legais de retenção",
  },
  {
    area: "Canal LGPD / encarregado",
    artigo: "Arts. 18 e 41",
    detalhe: "Pedidos de titular pelo e-mail de contato; operador como canal de dados",
  },
];

export default function PrivacidadePage() {
  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#D96C4A]">
          Legal · LGPD
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#1A1A1A]">
          Política de Privacidade
        </h1>
        <p className="text-[15px] sm:text-base leading-relaxed text-[#4A4A4A] max-w-2xl">
          Aviso de privacidade da <strong className="font-semibold text-[#1A1A1A]">{SITE_NAME}</strong>,
          em linguagem clara, nos termos do art. 9º da Lei nº 13.709/2018 (LGPD). Esta página
          detalha e organiza o que já consta na Seção 10 dos Termos de Uso e explica{" "}
          <em>onde</em> cada regra aparece no aplicativo.
        </p>
        <p className="text-xs text-[#4A4A4A]/60">
          Versão {TERMS_VERSION} · elaborada em {TERMS_DATE} · Feira de Santana, BA
        </p>
      </header>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">1. Quem é o controlador</h2>
        <p className="text-sm leading-relaxed text-[#3A3A3A]">
          O tratamento de dados pessoais no âmbito da {SITE_NAME} é realizado sob responsabilidade
          do operador identificado nos Termos de Uso (Seção 1): operação individual de{" "}
          <strong>Leonardo de Sant Anna Almeida</strong>. Por se tratar de agente de tratamento de
          pequeno porte, pode aplicar-se o regime simplificado da Resolução CD/ANPD nº 2/2022, no
          que couber. O próprio operador atua como canal de encarregado (art. 41 da LGPD).
        </p>
        <p className="text-sm leading-relaxed text-[#3A3A3A]">
          <strong>Contato para pedidos LGPD:</strong>{" "}
          <a
            href="mailto:santannaleonardo@hotmail.com"
            className="text-[#0A4D5C] underline underline-offset-2 hover:text-[#D96C4A]"
          >
            santannaleonardo@hotmail.com
          </a>
        </p>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">
          2. Quais dados coletamos e para quê
        </h2>
        <p className="text-sm text-[#4A4A4A] leading-relaxed">
          Alinhado à Seção 10.1 dos Termos, com indicação da base legal típica e de onde o dado
          aparece no produto:
        </p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[36rem] text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-black/10 text-[11px] uppercase tracking-wider text-[#4A4A4A]/70">
                <th className="py-2 pr-3 font-semibold">Dado</th>
                <th className="py-2 pr-3 font-semibold">Finalidade</th>
                <th className="py-2 pr-3 font-semibold">Base legal</th>
                <th className="py-2 font-semibold">No app</th>
              </tr>
            </thead>
            <tbody>
              {DATA_TABLE.map((row) => (
                <tr key={row.dado} className="border-b border-black/[0.06] align-top">
                  <td className="py-2.5 pr-3 text-[#1A1A1A] font-medium">{row.dado}</td>
                  <td className="py-2.5 pr-3 text-[#3A3A3A]">{row.finalidade}</td>
                  <td className="py-2.5 pr-3 text-[#3A3A3A]">{row.base}</td>
                  <td className="py-2.5 text-[#3A3A3A]">{row.onde}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">3. Bases legais (resumo)</h2>
        <ul className="space-y-2 text-sm text-[#3A3A3A] leading-relaxed">
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>
              <strong>Contrato (art. 7º, V):</strong> conta, feed, perfil, seguir, comentar, salas, DMs.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>
              <strong>Obrigação legal (art. 7º, II):</strong> registros de acesso (Marco Civil / Termos 9.5).
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>
              <strong>Legítimo interesse (art. 7º, IX):</strong> segurança, prevenção a fraudes e abuso.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>
              <strong>Consentimento (art. 7º, I):</strong> notificações push e geolocalização sob demanda.
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">4. Compartilhamento</h2>
        <p className="text-sm leading-relaxed text-[#3A3A3A]">
          Seus dados podem ser tratados por fornecedores de infraestrutura necessários ao serviço
          (hospedagem, banco de dados e armazenamento em nuvem — atualmente a <strong>Supabase</strong> —
          e serviços de envio de notificações push), sempre limitados ao necessário.{" "}
          <strong>Não vendemos</strong> dados a terceiros e{" "}
          <strong>não usamos</strong> para publicidade direcionada sem consentimento específico
          (Termos 10.3).
        </p>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">5. Retenção e exclusão</h2>
        <ul className="space-y-2 text-sm text-[#3A3A3A] leading-relaxed">
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>Dados mantidos enquanto a conta estiver ativa.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>
              Ao excluir a conta, dados pessoais são removidos, ressalvado o necessário para obrigação
              legal (ex.: logs de acesso) ou defesa de direitos.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D96C4A]" aria-hidden />
            <span>
              Mídias com expiração automática são removidas no prazo configurado, independentemente
              da exclusão da conta.
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">
          6. Seus direitos (art. 18 da LGPD)
        </h2>
        <ul className="space-y-3">
          {RIGHTS.map((r) => (
            <li key={r.right} className="text-sm leading-relaxed">
              <p className="font-medium text-[#1A1A1A]">{r.right}</p>
              <p className="text-[#4A4A4A] mt-0.5">{r.how}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">7. Segurança</h2>
        <p className="text-sm leading-relaxed text-[#3A3A3A]">
          Adotamos medidas razoáveis, como senhas armazenadas de forma criptografada, limitação de
          tentativas de acesso (rate limiting), sanitização de conteúdo e remoção de metadados de
          localização das imagens enviadas. Nenhum sistema é livre de risco. Em incidente com risco
          relevante, comunicaremos os titulares afetados e a ANPD, conforme a lei (Termos 10.6).
        </p>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">
          8. Controles de privacidade no aplicativo
        </h2>
        <ul className="grid sm:grid-cols-2 gap-2">
          {PRODUCT_CONTROLS.map((c) => (
            <li
              key={c.title}
              className="rounded-xl border border-black/[0.06] bg-[#F9F8F6] px-3 py-2.5 text-sm"
            >
              <p className="font-medium text-[#1A1A1A]">{c.title}</p>
              <p className="text-[12px] text-[#4A4A4A] mt-0.5">{c.where}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">
          9. Mapa LGPD → funções do app
        </h2>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[32rem] text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-black/10 text-[11px] uppercase tracking-wider text-[#4A4A4A]/70">
                <th className="py-2 pr-3 font-semibold">Área do app</th>
                <th className="py-2 pr-3 font-semibold">LGPD</th>
                <th className="py-2 font-semibold">Como se aplica</th>
              </tr>
            </thead>
            <tbody>
              {LGPD_MAP.map((row) => (
                <tr key={row.area} className="border-b border-black/[0.06] align-top">
                  <td className="py-2.5 pr-3 font-medium text-[#1A1A1A]">{row.area}</td>
                  <td className="py-2.5 pr-3 text-[#3A3A3A] whitespace-nowrap">{row.artigo}</td>
                  <td className="py-2.5 text-[#3A3A3A]">{row.detalhe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-serif text-xl font-medium text-[#1A1A1A]">
          10. Crianças e adolescentes
        </h2>
        <p className="text-sm leading-relaxed text-[#3A3A3A]">
          A {SITE_NAME} <strong>não é direcionada a menores de 18 anos</strong>. O cadastro exige
          declaração de maioridade. Contas identificadas como de menores podem ser suspensas e
          excluídas, com eliminação dos dados correspondentes, ressalvadas retenções legais
          (Termos Seções 3 e 11 — ECA Digital).
        </p>
      </section>

      <aside className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] p-4 sm:p-5 text-sm text-[#4A4A4A] leading-relaxed space-y-2">
        <p className="font-medium text-[#1A1A1A]">Documentos relacionados</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link href="/legal/funcionalidades" className="text-[#0A4D5C] underline underline-offset-2 hover:text-[#D96C4A]">
              Funcionalidades
            </Link>{" "}
            — o que o app oferece
          </li>
          <li>
            <Link href="/" className="text-[#0A4D5C] underline underline-offset-2 hover:text-[#D96C4A]">
              App → Configurações → Legal → Termos de Uso
            </Link>{" "}
            — documento completo (inclui Seção 10)
          </li>
        </ul>
        <p className="text-xs pt-2">
          Este texto é informativo e reflete a política declarada nos Termos vigentes. Em caso de
          divergência, prevalece a versão dos Termos de Uso aceita no cadastro, até atualização
          formal.
        </p>
      </aside>
    </article>
  );
}
