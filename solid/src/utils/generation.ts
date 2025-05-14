export const generateRandomSeed = () => {
  return Number.parseInt(String(Math.random() * 10_000_000));
};
