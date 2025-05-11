export const modelTypeToSlang = (modelType: string) => {
  const compModelType = modelType.toLowerCase().replaceAll(" ", "-");

  if (compModelType.includes("checkpoint")) return "CK";
  if (compModelType.includes("lora")) return "LR";
  if (compModelType.includes("textual")) return "TI";
  if (compModelType.includes("locon")) return "LC";
  if (compModelType.includes("aesthetic")) return "AG";
  if (compModelType.includes("hyper")) return "HN";
  if (compModelType.includes("control")) return "CN";
  console.log(modelType);
};
