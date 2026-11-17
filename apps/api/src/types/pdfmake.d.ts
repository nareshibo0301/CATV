declare module 'pdfmake' {
  export default class PdfPrinter {
    constructor(fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>);
    createPdfKitDocument(definition: object): NodeJS.ReadableStream & { end(): void };
  }
}
