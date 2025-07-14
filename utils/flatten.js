function flattenObject(obj, prefix = "") {
  const flattened = {};
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === "object") {
        value.forEach((item, index) => {
          Object.assign(
            flattened,
            flattenObject(item, `${newKey}_${index + 1}`)
          );
        });
      } else {
        flattened[newKey] = value.join("; ");
      }
    } else if (typeof value === "object" && value !== null) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  }
  return flattened;
}

module.exports = { flattenObject };
