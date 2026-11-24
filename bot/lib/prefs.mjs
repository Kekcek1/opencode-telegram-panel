export function modelKey(model) {
  return `${model.providerID}/${model.id}`;
}

export function modelRef(model) {
  return {
    providerID: model.providerID,
    id: model.id,
    ...(model.variant ? { variant: model.variant } : {}),
  };
}

export function prefs(store) {
  store.data.modelPrefs ??= { favorites: [], hidden: [] };
  return store.data.modelPrefs;
}

export function isFavorite(store, model) {
  return prefs(store).favorites.includes(modelKey(model));
}

export function isHidden(store, model) {
  return prefs(store).hidden.includes(modelKey(model));
}

export function decorate(store, models) {
  return models.map((model) => ({
    ...model,
    favorite: isFavorite(store, model),
    hidden: isHidden(store, model),
  }));
}

export function visible(store, models) {
  return decorate(store, models).filter((model) => !model.hidden);
}

export function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function toggleFavorite(store, model) {
  const data = prefs(store);
  data.favorites = toggle(data.favorites, modelKey(model));
  return data.favorites.includes(modelKey(model));
}

export function toggleHidden(store, model) {
  const data = prefs(store);
  data.hidden = toggle(data.hidden, modelKey(model));
  return data.hidden.includes(modelKey(model));
}

export function favoriteModels(store, models) {
  return decorate(store, models).filter((model) => model.favorite && !model.hidden);
}
