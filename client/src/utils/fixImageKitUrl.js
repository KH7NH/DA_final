export const fixImageKitUrl = (url) => {
  if (!url || typeof url !== "string") return url;

  // Fix all ImageKit transform segments: tr:... where transforms are separated by ":"
  // Convert "tr:q-auto:f-webp:w-1080:blur-60" -> "tr:q-auto,f-webp,w-1080,blur-60"
  return url.replace(/tr:([^?]+)/g, (_, transforms) => {
    const fixed = transforms.split(":").join(",");
    return `tr:${fixed}`;
  });
};
