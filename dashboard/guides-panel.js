import {mountMaterialLibrary} from '../js/material-library.mjs';

export function initGuidesPanel() {
  return mountMaterialLibrary(document.getElementById('guides-grid'));
}
