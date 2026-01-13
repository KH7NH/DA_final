export const fixImageKitUrl = (url) => {
  if (!url || typeof url !== "string") return url;

  // Fix sai format transform (":" -> ",")
  return url.replace("tr:q-auto:f-webp:w-1280", "tr:q-auto,f-webp,w-1280");
};
