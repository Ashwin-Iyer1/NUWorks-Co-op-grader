module.exports = {
  existsSync: () => false,
  readFileSync: () => "",
  promises: {
    readFile: async () => "",
  },
};
