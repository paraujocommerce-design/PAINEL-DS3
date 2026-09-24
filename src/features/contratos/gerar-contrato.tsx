import { useMemo, useState, type FormEvent } from "react";
import { Dialog, ClassicButton, Field, Input, Select, Alert, Table } from "@/components/w2k";
import type { Column } from "@/components/w2k";
import { useRepresentantesParaContrato, useSalvarContratoGerado } from "./api";
import { gerarPDFContrato } from "./pdf-generator";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function limparCPF(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function limparCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function limparTelefone(tel: string): string {
  return tel.replace(/\D/g, "");
}

interface ProdutoSelecionado {
  opcao: number;
  descricao: string;
  valor: number;
  quantidade: number;
}

const PRODUTOS: Array<{ opcao: number; descricao: string; valor: number }> = [
  {
    opcao: 1,
    descricao: "RELATÓRIO SERASA COMPLETO COM SCORE (CPF/CNPJ)",
    valor: 12.9,
  },
  {
    opcao: 2,
    descricao: "CONSULTA SERASA TOP (CPF/CNPJ)",
    valor: 9.9,
  },
  {
    opcao: 3,
    descricao: "RELATÓRIO SERASA GOLD (CPF/CNPJ)",
    valor: 14.9,
  },
  {
    opcao: 4,
    descricao: "SCORE SERASA COM CADASTRO POSITIVO (CPF/CNPJ)",
    valor: 12.9,
  },
  {
    opcao: 5,
    descricao: "LOCALIZADOR NACIONAL - RELATÓRIO COMPLETO CPF",
    valor: 1.99,
  },
  {
    opcao: 6,
    descricao: "LOCALIZADOR NACIONAL - RELATÓRIO COMPLETO CNPJ",
    valor: 1.99,
  },
  {
    opcao: 7,
    descricao: "DADOS CADASTRAIS COMPLEMENTARES (CPF/CNPJ)",
    valor: 1.99,
  },
  {
    opcao: 8,
    descricao: "LOCALIZADOR NACIONAL - ITENS 05 ou 06 VIA TELEFONE",
    valor: 3.99,
  },
  {
    opcao: 9,
    descricao: "RELATÓRIO DE PROCESSOS JUDICIAIS E CRIMINAIS",
    valor: 1.99,
  },
  {
    opcao: 10,
    descricao: "RELATÓRIO DETALHADO DE PROCESSOS JUDICIAIS E CRIMINAIS",
    valor: 5.9,
  },
  {
    opcao: 11,
    descricao: "RELATÓRIO CADIN DETALHADO",
    valor: 8.99,
  },
  {
    opcao: 12,
    descricao: "CONSULTA DE MANDADO DE PRISÃO (CPF)",
    valor: 2.99,
  },
  {
    opcao: 13,
    descricao: "NEGATIVAÇÃO SERASA EXPERIAN",
    valor: 14.9,
  },
  {
    opcao: 14,
    descricao: "MANUTENÇÃO PEFIN (BASE ATIVA)",
    valor: 4.9,
  },
  {
    opcao: 15,
    descricao: "PREENCHIMENTO AUTOMÁTICO PARA NEGATIVAÇÃO",
    valor: 1.99,
  },
  {
    opcao: 16,
    descricao: "CONSULTA VEICULAR DIAMOND",
    valor: 45.9,
  },
  {
    opcao: 17,
    descricao: "CONSULTA VEICULAR - PROPRIETÁRIOS POR PLACA",
    valor: 15.9,
  },
  {
    opcao: 18,
    descricao: "SERASA ANTIFRAUDE (ME PROTEJA)",
    valor: 39.9,
  },
];

export function DialogGerarContrato({ open, onClose }: { open: boolean; onClose: () => void }) {
  const representantes = useRepresentantesParaContrato();
  const salvar = useSalvarContratoGerado();

  // Dados da empresa
  const [representanteId, setRepresentanteId] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cep, setCep] = useState("");
  const [pontoReferencia, setPontoReferencia] = useState("");

  // Contatos
  const [dddTelefone, setDddTelefone] = useState("");
  const [telefoneFix, setTelefoneFix] = useState("");
  const [dddCel1, setDddCel1] = useState("");
  const [celular1, setCelular1] = useState("");
  const [dddCel2, setDddCel2] = useState("");
  const [celular2, setCelular2] = useState("");
  const [emailFatura, setEmailFatura] = useState("");

  // Responsáveis
  const [responsavelPagamentos, setResponsavelPagamentos] = useState("");
  const [fiador, setFiador] = useState("");
  const [cpfFiador, setCpfFiador] = useState("");

  // Contrato
  const [associadoNo, setAssociadoNo] = useState("");
  const [planoMensal, setPlanoMensal] = useState("");
  const [vencimento, setVencimento] = useState("10");
  const [dataContrato, setDataContrato] = useState(hojeISO());

  // Produtos selecionados
  const [produtos, setProdutos] = useState<ProdutoSelecionado[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    setRepresentanteId("");
    setRazaoSocial("");
    setNomeFantasia("");
    setCnpj("");
    setEndereco("");
    setBairro("");
    setCidade("");
    setUf("");
    setCep("");
    setPontoReferencia("");
    setDddTelefone("");
    setTelefoneFix("");
    setDddCel1("");
    setCelular1("");
    setDddCel2("");
    setCelular2("");
    setEmailFatura("");
    setResponsavelPagamentos("");
    setFiador("");
    setCpfFiador("");
    setAssociadoNo("");
    setPlanoMensal("");
    setVencimento("10");
    setDataContrato(hojeISO());
    setProdutos([]);
    setErro(null);
    salvar.reset();
    onClose();
  }

  function adicionarProduto(opcao: number) {
    const prod = PRODUTOS.find((p) => p.opcao === opcao);
    if (!prod) return;

    const existe = produtos.findIndex((p) => p.opcao === opcao);
    if (existe >= 0) {
      const novo = [...produtos];
      novo[existe].quantidade += 1;
      setProdutos(novo);
    } else {
      setProdutos([
        ...produtos,
        { opcao, descricao: prod.descricao, valor: prod.valor, quantidade: 1 },
      ]);
    }
  }

  function removerProduto(opcao: number) {
    setProdutos(produtos.filter((p) => p.opcao !== opcao));
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);

    // Validações obrigatórias
    if (!cnpj.trim()) return setErro("CNPJ é obrigatório.");
    if (!razaoSocial.trim()) return setErro("Razão Social é obrigatória.");
    if (!fiador.trim()) return setErro("Responsável (fiador) é obrigatório.");
    if (!cpfFiador.trim()) return setErro("CPF do fiador é obrigatório.");

    const cnpjLimpo = limparCNPJ(cnpj);
    const cpfLimpo = limparCPF(cpfFiador);

    if (cnpjLimpo.length !== 14) return setErro("CNPJ deve ter 14 dígitos.");
    if (cpfLimpo.length !== 11) return setErro("CPF deve ter 11 dígitos.");

    // Validação de plano
    const plano = parseFloat(planoMensal.replace(",", "."));
    if (Number.isNaN(plano) || plano <= 0)
      return setErro("Plano mensal deve ser um valor válido maior que zero.");

    try {
      // Gerar PDF
      const pdfBlob = await gerarPDFContrato({
        razaoSocial,
        nomeFantasia,
        cnpj: cnpjLimpo,
        endereco,
        bairro,
        cidade,
        uf,
        cep,
        pontoReferencia,
        dddTelefone,
        telefoneFix,
        dddCel1,
        celular1,
        dddCel2,
        celular2,
        emailFatura,
        responsavelPagamentos,
        fiador,
        cpfFiador: cpfLimpo,
        associadoNo,
        planoMensal: plano,
        vencimento,
        dataContrato,
        produtos,
      });

      // Salvar no Supabase
      const nomeArquivo = `${razaoSocial.substring(0, 30)}_${cnpjLimpo}_${new Date().getTime()}.pdf`;
      await salvar.mutateAsync({
        pdfBlob,
        nomeArquivo,
        razaoSocial,
        cnpj: cnpjLimpo,
        planoMensal: plano,
      });

      // Offerecer download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível gerar o contrato.");
    }
  }

  const totalProdutos = useMemo(
    () => produtos.reduce((soma, p) => soma + p.valor * p.quantidade, 0),
    [produtos],
  );

  const colunasProdutos: Column[] = [
    { key: "opcao", label: "Opção" },
    { key: "descricao", label: "Descrição" },
    { key: "valor", label: "Valor", align: "right" },
    { key: "quantidade", label: "Qtd", align: "right" },
    { key: "subtotal", label: "Subtotal", align: "right" },
    { key: "remover", label: "" },
  ];

  return (
    <Dialog title="Gerar Contrato" open={open} onOpenChange={fechar}>
      <form onSubmit={enviar} className="space-y-4 max-h-[80vh] overflow-y-auto">
        {erro && <Alert tone="error" title={erro} />}

        {/* Seção: Dados da Empresa */}
        <fieldset className="border rounded p-3">
          <legend className="font-bold text-sm">Dados da Empresa</legend>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Razão Social *">
              <Input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
            </Field>
            <Field label="Nome de Fantasia">
              <Input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
            </Field>
            <Field label="CNPJ *">
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Associado nº">
              <Input value={associadoNo} onChange={(e) => setAssociadoNo(e.target.value)} />
            </Field>
            <Field label="Endereço" className="col-span-2">
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </Field>
            <Field label="Bairro">
              <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </Field>
            <Field label="Ponto de referência">
              <Input
                value={pontoReferencia}
                onChange={(e) => setPontoReferencia(e.target.value)}
              />
            </Field>
            <Field label="Cidade">
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </Field>
            <Field label="UF">
              <Input value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} />
            </Field>
            <Field label="CEP">
              <Input value={cep} onChange={(e) => setCep(e.target.value)} />
            </Field>
          </div>
        </fieldset>

        {/* Seção: Contatos */}
        <fieldset className="border rounded p-3">
          <legend className="font-bold text-sm">Contatos</legend>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="DDD Telefone">
              <Input
                value={dddTelefone}
                onChange={(e) => setDddTelefone(e.target.value)}
                maxLength={2}
              />
            </Field>
            <Field label="Telefone fixo">
              <Input value={telefoneFix} onChange={(e) => setTelefoneFix(e.target.value)} />
            </Field>
            <Field label="DDD Celular 01">
              <Input
                value={dddCel1}
                onChange={(e) => setDddCel1(e.target.value)}
                maxLength={2}
              />
            </Field>
            <Field label="Celular 01">
              <Input value={celular1} onChange={(e) => setCelular1(e.target.value)} />
            </Field>
            <Field label="DDD Celular 02">
              <Input
                value={dddCel2}
                onChange={(e) => setDddCel2(e.target.value)}
                maxLength={2}
              />
            </Field>
            <Field label="Celular 02">
              <Input value={celular2} onChange={(e) => setCelular2(e.target.value)} />
            </Field>
            <Field label="E-mail para faturas" className="col-span-2">
              <Input
                type="email"
                value={emailFatura}
                onChange={(e) => setEmailFatura(e.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        {/* Seção: Responsáveis */}
        <fieldset className="border rounded p-3">
          <legend className="font-bold text-sm">Responsáveis</legend>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Representante" className="col-span-2">
              <Select
                value={representanteId}
                onChange={(e) => setRepresentanteId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {(representantes.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} — {r.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável pelos pagamentos">
              <Input
                value={responsavelPagamentos}
                onChange={(e) => setResponsavelPagamentos(e.target.value)}
              />
            </Field>
            <Field label="Fiador (assinatura contrato) *">
              <Input value={fiador} onChange={(e) => setFiador(e.target.value)} />
            </Field>
            <Field label="CPF do fiador *">
              <Input
                value={cpfFiador}
                onChange={(e) => setCpfFiador(e.target.value)}
                placeholder="000.000.000-00"
              />
            </Field>
          </div>
        </fieldset>

        {/* Seção: Plano */}
        <fieldset className="border rounded p-3">
          <legend className="font-bold text-sm">Plano e Vencimento</legend>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Plano mensal (R$) *">
              <Input
                value={planoMensal}
                onChange={(e) => setPlanoMensal(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Vencimento da fatura (dia)">
              <Input
                type="number"
                min="1"
                max="31"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </Field>
            <Field label="Data do contrato" className="col-span-2">
              <Input
                type="date"
                value={dataContrato}
                onChange={(e) => setDataContrato(e.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        {/* Seção: Produtos/Serviços */}
        <fieldset className="border rounded p-3">
          <legend className="font-bold text-sm">Produtos/Serviços Contratados</legend>
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              {PRODUTOS.map((prod) => (
                <ClassicButton
                  key={prod.opcao}
                  onClick={() => adicionarProduto(prod.opcao)}
                  variant="default"
                  className="text-xs"
                >
                  Op. {prod.opcao}
                </ClassicButton>
              ))}
            </div>

            {produtos.length > 0 && (
              <div className="mt-4">
                <Table
                  columns={colunasProdutos}
                  caption="Produtos selecionados"
                  rows={produtos.map((p) => ({
                    opcao: `${p.opcao}`,
                    descricao: p.descricao,
                    valor: `R$ ${p.valor.toFixed(2)}`,
                    quantidade: `${p.quantidade}`,
                    subtotal: `R$ ${(p.valor * p.quantidade).toFixed(2)}`,
                    remover: (
                      <ClassicButton
                        onClick={() => removerProduto(p.opcao)}
                        variant="default"
                        className="text-xs"
                      >
                        Remover
                      </ClassicButton>
                    ),
                  }))}
                />
                <div className="mt-2 text-right font-bold">
                  Total produtos: R$ {totalProdutos.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </fieldset>

        {/* Botões */}
        <div className="flex gap-2 justify-end mt-4">
          <ClassicButton onClick={fechar} variant="default">
            Cancelar
          </ClassicButton>
          <ClassicButton type="submit" variant="primary" disabled={salvar.isPending}>
            {salvar.isPending ? "Gerando..." : "Gerar e Baixar PDF"}
          </ClassicButton>
        </div>
      </form>
    </Dialog>
  );
}
