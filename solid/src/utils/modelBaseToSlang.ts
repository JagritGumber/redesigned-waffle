export const modelBaseToSlang = (modelBase: string) => {
  const compModelBase = modelBase.replaceAll(" ", "");

  if (compModelBase.includes("SDXL")) return "XL";
  if (compModelBase.toLowerCase().includes("pony")) return "PO";
  if (compModelBase.toLowerCase().includes("illustrious")) return "IL";
  if (compModelBase.toLowerCase().includes("noobai")) return "NB";
  if (compModelBase.toLowerCase().endsWith("hyper"))
    return compModelBase.replace("Hyper", "H");
  return compModelBase;
};
