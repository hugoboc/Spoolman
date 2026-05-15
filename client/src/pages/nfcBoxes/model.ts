import { ISpool } from "../spools/model";

export interface INfcBox {
  id: number;
  registered: string;
  token: string;
  name: string;
  spool?: ISpool;
  comment?: string;
}
