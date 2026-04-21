// Tipos de documentos que maneja Contifico
export type ContificoTipoDocumento = 'FAC' | 'LQC' | 'PRE';
export type ContificoTipoRegistro = 'CLI' | 'PRO';
export type ContificoEstado = 'P' | 'C' | 'G' | 'A' | 'E' | 'F';

export interface ContificoPersona {
  cedula: string;
  razon_social: string;
  tipo: 'N' | 'J' | 'I' | 'P';
  ruc?: string;
  telefonos?: string;
  direccion?: string;
  email?: string;
  es_extranjero?: boolean;
}

export interface ContificoDetalle {
  producto_id: string;
  cantidad: number;
  precio: number;
  porcentaje_iva: number;
  porcentaje_descuento: number;
  base_cero: number;
  base_gravable: number;
  base_no_gravable: number;
  porcentaje_ice?: number;
  valor_ice?: number | null;
}

export interface ContificoCobro {
  forma_cobro: string;
  monto: number;
  numero_cheque?: string;
  tipo_ping?: string;
}

export interface ContificoCreateDocumentoDto {
  pos: string;
  fecha_emision: string;
  tipo_documento: ContificoTipoDocumento;
  tipo_registro?: ContificoTipoRegistro;
  documento: string;
  estado?: ContificoEstado;
  autorizacion: string;
  caja_id?: string | null;
  cliente: ContificoPersona;
  descripcion?: string;
  subtotal_0: number;
  subtotal_12: number;
  iva: number;
  ice: number;
  servicio?: number;
  total: number;
  adicional1?: string;
  adicional2?: string;
  detalles: ContificoDetalle[];
  cobros?: ContificoCobro[];
}

export interface ContificoDocumentoResponse {
  id: string;
  documento: string;
  total: string;
  estado: string;
  fecha_emision: string;
  electronico: boolean;
  url_ride?: string;
  url_xml?: string;
}
