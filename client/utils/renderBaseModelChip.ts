export const renderbaseModelChip = (baseModel: string | null) => {
  const comparisonBaseModel = baseModel?.toLowerCase().replaceAll(' ', '');
  if (comparisonBaseModel?.includes('sdxl')) return 'XL';
  if (comparisonBaseModel?.includes('sd')) return 'SD';
  if (comparisonBaseModel?.includes('pony')) return 'PO';
  if (comparisonBaseModel?.includes('illustrious')) return 'ILL';
  if (comparisonBaseModel?.includes('other')) return 'O';
  if (comparisonBaseModel?.includes('flux')) return 'FX';
  if (comparisonBaseModel?.includes('noob')) return 'NB';
  console.log({ baseModel });
};
