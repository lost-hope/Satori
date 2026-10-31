const catalogData = require('./envWizardCatalog.json');

function getBoardCategories() {
  return catalogData.boardCategories;
}

function getBoards() {
  return catalogData.boards;
}

function getBoardsByCategory(categoryId) {
  return catalogData.boards.filter((board) => board.category === categoryId);
}

function getBoardById(id) {
  return catalogData.boards.find((board) => board.id === id);
}

function getFeatures() {
  return catalogData.features;
}

function getUsermodCategories() {
  return catalogData.usermodCategories;
}

function getUsermodsByCategory(categoryId) {
  return catalogData.usermods.filter((usermod) => usermod.category === categoryId);
}

function getUsermodById(id) {
  return catalogData.usermods.find((usermod) => usermod.id === id);
}

module.exports = {
  getBoardCategories,
  getBoards,
  getBoardsByCategory,
  getBoardById,
  getFeatures,
  getUsermodCategories,
  getUsermodsByCategory,
  getUsermodById,
};
