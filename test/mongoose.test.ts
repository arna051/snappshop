import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createSnappShopModels } from '../src/mongoose/index.js';

const encryption = {
  async encrypt(plaintext: string) {
    return { ciphertext: `encrypted:${plaintext}`, keyId: 'test-key' };
  },
  async decrypt(input: { ciphertext: string }) {
    return input.ciphertext.replace(/^encrypted:/, '');
  },
};

describe('Mongoose integration', () => {
  it('uses configurable names and can be imported repeatedly without model overwrite errors', async () => {
    const connection = mongoose.createConnection();
    const first = createSnappShopModels({
      connection,
      encryption,
      modelPrefix: 'TestSnapp',
      collectionPrefix: 'test_snapp_',
    });
    const second = createSnappShopModels({
      connection,
      encryption,
      modelPrefix: 'TestSnapp',
      collectionPrefix: 'test_snapp_',
    });
    expect(second.Account).toBe(first.Account);
    expect(first.Account.collection.name).toBe('test_snapp_accounts');
    await connection.close();
  });

  it('defines uniqueness constraints for accounts, mappings and checkpoints', async () => {
    const connection = mongoose.createConnection();
    const models = createSnappShopModels({ connection, encryption, modelPrefix: 'IndexTest' });
    const accountIndexes = models.Account.schema.indexes();
    const mappingIndexes = models.Mapping.schema.indexes();
    const checkpointIndexes = models.Checkpoint.schema.indexes();
    expect(accountIndexes).toContainEqual([
      { accountId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    expect(mappingIndexes.filter(([, options]) => options.unique)).toHaveLength(2);
    expect(mappingIndexes).toContainEqual([
      { accountId: 1, vendorId: 1, scopeId: 1, sku: 1 },
      expect.not.objectContaining({ unique: true }),
    ]);
    expect(checkpointIndexes).toContainEqual([
      { accountId: 1, vendorId: 1, kind: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    await connection.close();
  });

  it('removes encrypted credential material from object serialization', async () => {
    const connection = mongoose.createConnection();
    const models = createSnappShopModels({ connection, encryption, modelPrefix: 'SecretTest' });
    const account = new models.Account({
      accountId: 'account',
      clientCode: 'client',
      encryptedToken: 'ciphertext',
      keyId: 'key-id',
    });
    expect(account.toJSON()).not.toHaveProperty('encryptedToken');
    expect(account.toJSON()).not.toHaveProperty('keyId');
    await connection.close();
  });

  it('refuses silent collection-prefix changes for an existing model name', async () => {
    const connection = mongoose.createConnection();
    createSnappShopModels({
      connection,
      encryption,
      modelPrefix: 'Conflict',
      collectionPrefix: 'a_',
    });
    expect(() =>
      createSnappShopModels({
        connection,
        encryption,
        modelPrefix: 'Conflict',
        collectionPrefix: 'b_',
      }),
    ).toThrow(/another collection/);
    await connection.close();
  });
});
