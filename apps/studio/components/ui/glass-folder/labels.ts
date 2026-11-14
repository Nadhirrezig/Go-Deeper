import type { GlassFolderLabels } from "./types";

export const GLASS_FOLDER_LABELS_FR: GlassFolderLabels = {
  openFolder: "Ouvrir le dossier",
  closeFolder: "Fermer le dossier",
  open: "Ouvrir",
  close: "Fermer",
  count: (n) => n + (n > 1 ? " flipbooks" : " flipbook"),
  addFile: "Ajouter un flipbook à",
  moreOptions: "Plus d'options pour",
  contents: "Contenu de",
  options: "Options de",
  untitled: "Sans titre",
};

export const GLASS_FOLDER_LABELS_EN: GlassFolderLabels = {
  openFolder: "Open folder",
  closeFolder: "Close folder",
  open: "Open",
  close: "Close",
  count: (n) => n + (n === 1 ? " item" : " items"),
  addFile: "Add a file to",
  moreOptions: "More options for",
  contents: "Contents of",
  options: "Options for",
  untitled: "Untitled",
};
