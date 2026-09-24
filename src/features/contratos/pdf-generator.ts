import { jsPDF } from "jspdf";
import "jspdf-autotable";

interface DadosContrato {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  pontoReferencia: string;
  dddTelefone: string;
  telefoneFix: string;
  dddCel1: string;
  celular1: string;
  dddCel2: string;
  celular2: string;
  emailFatura: string;
  responsavelPagamentos: string;
  fiador: string;
  cpfFiador: string;
  associadoNo: string;
  planoMensal: number;
  vencimento: string;
  dataContrato: string;
  produtos: Array<{
    opcao: number;
    descricao: string;
    valor: number;
    quantidade: number;
  }>;
}

const CLAULAS_TEXTO = `CLÁUSULAS

1ª) A CONTRATANTE, de acordo com o contratado, adquire o direito de utilização dos serviços contratados. As informações são de caráter confidencial e para uso exclusivo da CONTRATANTE, não sendo permitida sua divulgação ou comercialização (revenda).

1.1) As consultas e serviços utilizados serão tarifadas de acordo com a franquia mensal contratada no anverso. A utilização de forma excedente e a utilização de consultas e serviços que não fazem parte da franquia contratada, serão tarifadas de acordo com valores informados no presente contrato. A franquia mensal das consultas e serviços contratados pela CONTRATANTE não será cumulativa aos meses posteriores.

1.2) O treinamento complementar para utilização dos produtos e serviços é de responsabilidade da CONTRATADA e será realizado, sempre quando solicitado, não cabendo essa função exclusivamente aos representantes comerciais.

1.3) As informações apresentadas nas consultas veiculares deverão ser utilizadas exclusivamente para orientação das transações comerciais da CONTRATANTE, responsabilizando-se civil e criminalmente por danos que ocasionar a terceiros quando utilizadas em desacordo com legislação em vigor.

2ª) A CONTRATANTE terá acesso aos produtos e serviços contratados mediante código e senha exclusivos. A CONTRATANTE responsabiliza-se pelo resguardo de sua senha, que poderá ser alterada através de solicitação do responsável.

3ª) Mensalmente a CONTRATADA enviará, para o e-mail da CONTRATANTE cadastrado, uma fatura de acordo com as consultas e serviços contratados, cujo pagamento deverá ser efetuado até a data do vencimento. O atraso no pagamento acarretará multa de 2,0% e juros de mora de 0,33% ao dia.

4ª) O não pagamento das faturas e obrigações contratuais implicará na negativação da CONTRATANTE e do FIADOR na SERASA EXPERIAN.

5ª) Qualquer alteração ou rescisão deste contrato deverá ser formalizada por escrito entre as partes.

6ª) Este contrato é regido pelas leis da República Federativa do Brasil, elegendo as partes o foro da Comarca de São Paulo para dirimir qualquer dúvida oriunda deste contrato.

7ª) O representante comercial não é responsável pela execução do contrato, sendo essa responsabilidade exclusiva da CONTRATADA.

8ª) Este contrato tem validade de 12 (doze) meses, renováveis automaticamente, salvo se houver comunicação expressa de rescisão com 30 dias de antecedência.

9ª) A assinatura deste contrato implica na aceitação de todos os termos e condições aqui descritos.

Central de Atendimento e Treinamento ao Cliente
Fone: (11) 3014.8888 - WhatsApp: (11) 99983.9321
www.consultcenter.com.br`;

export async function gerarPDFContrato(dados: DadosContrato): Promise<Blob> {
  // Criar PDF em formato A4
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin;

  let yPos = margin;

  // ====== ANVERSO (FRENTE) ======

  // Título
  doc.setFontSize(14);
  doc.setFont("Helvetica", "bold");
  doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", pageWidth / 2, yPos, { align: "center" });
  yPos += 8;

  // Seção 1: Dados da Empresa (tabela 2 colunas)
  doc.setFontSize(10);
  doc.setFont("Helvetica", "normal");

  const campo = (label: string, valor: string, x: number, y: number, width: number) => {
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, x, y);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text(valor || "", x, y + 3);
    doc.setDrawColor(0);
    doc.line(x, y + 4, x + width, y + 4);
    return y + 7;
  };

  const col1X = margin;
  const col2X = margin + contentWidth / 2 + 2;
  const colWidth = contentWidth / 2 - 1;

  // Linha 1: Razão Social, Associado nº
  let y1 = campo("Razão Social:", dados.razaoSocial, col1X, yPos, colWidth);
  let y2 = campo("Associado nº:", dados.associadoNo, col2X, yPos, colWidth);
  yPos = Math.max(y1, y2);

  // Linha 2: Nome Fantasia, Representante
  y1 = campo("Nome de Fantasia:", dados.nomeFantasia, col1X, yPos, colWidth);
  y2 = campo("Representante:", "", col2X, yPos, colWidth);
  yPos = Math.max(y1, y2);

  // Linha 3: CNPJ
  y1 = campo("CNPJ:", dados.cnpj, col1X, yPos, colWidth);
  yPos = y1;

  // Endereço
  y1 = campo("Endereço:", dados.endereco, col1X, yPos, colWidth);
  y2 = campo("UF:", dados.uf, col2X, yPos, colWidth);
  yPos = Math.max(y1, y2);

  y1 = campo("Bairro:", dados.bairro, col1X, yPos, colWidth);
  y2 = campo("Cidade:", dados.cidade, col2X, yPos, colWidth);
  yPos = Math.max(y1, y2);

  y1 = campo("Ponto de referência:", dados.pontoReferencia, col1X, yPos, colWidth);
  y2 = campo("CEP:", dados.cep, col2X, yPos, colWidth);
  yPos = Math.max(y1, y2);

  // Contatos
  y1 = campo(
    "DDD:",
    dados.dddTelefone,
    col1X,
    yPos,
    30,
  );
  y2 = campo("Telefone fixo:", dados.telefoneFix, col1X + 35, yPos, colWidth - 35);
  yPos = Math.max(y1, y2);

  y1 = campo("DDD:", dados.dddCel1, col1X, yPos, 30);
  y2 = campo("Celular 01:", dados.celular1, col1X + 35, yPos, colWidth - 35);
  yPos = Math.max(y1, y2);

  y1 = campo("DDD:", dados.dddCel2, col1X, yPos, 30);
  y2 = campo("Celular 02:", dados.celular2, col1X + 35, yPos, colWidth - 35);
  yPos = Math.max(y1, y2);

  y1 = campo("E-mail para recebimento das faturas:", dados.emailFatura, col1X, yPos, contentWidth);
  yPos = y1;

  y1 = campo("Responsável pelos pagamentos:", dados.responsavelPagamentos, col1X, yPos, contentWidth);
  yPos = y1;

  y1 = campo("Responsável pela assinatura do contrato (fiador):", dados.fiador, col1X, yPos, contentWidth);
  yPos = y1;

  y1 = campo("CPF do responsável (fiador):", dados.cpfFiador, col1X, yPos, contentWidth);
  yPos = y1;

  // Plano
  y1 = campo("PLANO MENSAL CONTRATADO:", `R$ ${dados.planoMensal.toFixed(2)}`, col1X, yPos, contentWidth);
  yPos = y1;

  // Tabela de produtos
  if (dados.produtos.length > 0) {
    const tableData = dados.produtos.map((p) => [
      `OPÇÃO ${p.opcao}`,
      p.descricao.substring(0, 60),
      `${p.quantidade}`,
      `R$ ${p.valor.toFixed(2)}`,
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [["OPÇÃO", "DESCRIÇÃO", "QTD", "VALOR"]],
      body: tableData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fontStyle: "bold", fillColor: [200, 200, 200] },
      columnStyles: { 0: { halign: "center", cellWidth: 20 }, 2: { halign: "center", cellWidth: 15 }, 3: { halign: "right", cellWidth: 25 } },
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;
  }

  // Vencimento
  y1 = campo("VENCIMENTO DA FATURA:", `DIA ${dados.vencimento}`, col1X, yPos, contentWidth);
  yPos = y1;

  // Assinatura
  yPos += 8;
  doc.setFontSize(9);
  doc.text("O responsável (fiador) declara ser devidamente autorizado a efetuar a contratação dos produtos", col1X, yPos);
  yPos += 3;
  doc.text("e serviços acima discriminados, e assina o presente contrato, regido pelas cláusulas no verso.", col1X, yPos);
  yPos += 8;

  doc.text("Data do contrato: ___/___/___", col1X, yPos);
  yPos += 12;

  doc.text("_____________________________", col1X, yPos);
  yPos += 3;
  doc.text("Assinatura do contratante e fiador", col1X, yPos, { align: "center", maxWidth: contentWidth });
  yPos += 3;
  doc.text("Conforme documento de identificação", col1X, yPos, { align: "center", maxWidth: contentWidth });

  // ====== PÁGINA 2: VERSO (COSTAS) COM CLÁUSULAS ======

  doc.addPage();
  yPos = margin;

  doc.setFontSize(11);
  doc.setFont("Helvetica", "bold");
  doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", pageWidth / 2, yPos, { align: "center" });
  yPos += 7;

  doc.setFontSize(8);
  doc.setFont("Helvetica", "normal");
  const linhas = doc.splitTextToSize(CLAULAS_TEXTO, contentWidth);
  const textHeight = doc.getTextDimensions(linhas).h;

  doc.text(linhas, col1X, yPos);

  // Rodapé
  yPos = pageHeight - margin - 10;
  doc.setFontSize(7);
  doc.text("Central de Atendimento: Fone: (11) 3014.8888 | WhatsApp: (11) 99983.9321", pageWidth / 2, yPos, {
    align: "center",
  });
  yPos += 3;
  doc.text("www.consultcenter.com.br", pageWidth / 2, yPos, { align: "center" });

  return new Promise((resolve) => {
    const blob = doc.output("blob");
    resolve(blob);
  });
}
