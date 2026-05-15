import { getBasePath } from "../../utils/url";
import { INfcBox } from "./model";

export function getNfcBoxUrl(box: INfcBox): string {
  return `${window.location.origin}${getBasePath()}/nfc/box/${box.token}`;
}
