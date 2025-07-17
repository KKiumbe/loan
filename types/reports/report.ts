export type TextBlock = {
  text: string;
  fontSize?: number;
  bold?: boolean;
  margin?: number[];
};


export interface PDFDocumentCustom {
  image(src: string, x: number, y: number, options?: { width?: number }): this;
  fontSize(size: number): this;
  font(font: string): this;
  fillColor(color: string): this;
  text(text: string, x: number, y: number, options?: { align?: string }): this;
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  lineWidth(width: number): this;
  strokeColor(color: string): this;
  stroke(): this;
}