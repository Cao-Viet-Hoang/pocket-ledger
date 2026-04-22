/**
 * Firebase wrapper.
 *
 * Thin abstraction on top of the Firebase compat SDK so the rest of the app
 * doesn't have to know about Firestore specifics.
 *
 * Layout in Firestore:
 *   ledgers/{username}                      -> meta doc ({ settings, seededAt })
 *   ledgers/{username}/categories/{id}
 *   ledgers/{username}/people/{id}
 *   ledgers/{username}/transactions/{id}
 *   ledgers/{username}/lending/{id}         -> payments stored as an array field
 *   ledgers/{username}/borrowing/{id}       -> payments stored as an array field
 */
(function (global) {
  'use strict';

  let app = null;
  let db = null;
  let currentUser = null;

  async function init(config, username) {
    if (!global.firebase) {
      throw new Error('Firebase SDK not loaded');
    }
    if (app) {
      try { await app.delete(); } catch (_) {}
      app = null;
      db = null;
    }
    // If a default app is still around (e.g. from a prior failed attempt), clean it up.
    try {
      const existing = firebase.apps.find((a) => a.name === '[DEFAULT]');
      if (existing) await existing.delete();
    } catch (_) {}

    app = firebase.initializeApp(config);
    db = firebase.firestore();
    currentUser = String(username).trim();
    // Validate connectivity with a lightweight read.
    await db.collection('ledgers').doc(currentUser).get();
  }

  function requireReady() {
    if (!db || !currentUser) throw new Error('Firebase not initialized');
  }

  function userDoc() {
    requireReady();
    return db.collection('ledgers').doc(currentUser);
  }

  async function getAll(name) {
    const snap = await userDoc().collection(name).get();
    return snap.docs.map((d) => {
      const data = d.data() || {};
      return Object.assign({ id: d.id }, data);
    });
  }

  async function getUserMeta() {
    const snap = await userDoc().get();
    return snap.exists ? snap.data() : null;
  }

  async function setUserMeta(data) {
    await userDoc().set(data, { merge: true });
  }

  async function setItem(name, id, data) {
    const clean = Object.assign({}, data);
    delete clean.id;
    await userDoc().collection(name).doc(id).set(clean);
  }

  async function updateItem(name, id, data) {
    const clean = Object.assign({}, data);
    delete clean.id;
    await userDoc().collection(name).doc(id).update(clean);
  }

  async function deleteItem(name, id) {
    await userDoc().collection(name).doc(id).delete();
  }

  async function arrayUnion(name, id, field, values) {
    await userDoc().collection(name).doc(id).update({
      [field]: firebase.firestore.FieldValue.arrayUnion(...values)
    });
  }

  async function arrayRemove(name, id, field, values) {
    await userDoc().collection(name).doc(id).update({
      [field]: firebase.firestore.FieldValue.arrayRemove(...values)
    });
  }

  function getUsername() { return currentUser; }
  function isReady() { return Boolean(db && currentUser); }

  global.FirebaseClient = {
    init, getAll, getUserMeta, setUserMeta,
    setItem, updateItem, deleteItem,
    arrayUnion, arrayRemove,
    getUsername, isReady
  };
})(window);
