// Copyright (c) 2026 Ashwin Iyer — Licensed under AGPL-3.0

module.exports = {
  existsSync: () => false,
  readFileSync: () => "",
  promises: {
    readFile: async () => "",
  },
};
