import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { z } from 'zod';
import { SnappShopMappingAmbiguityError } from '../core/errors.js';

export interface EncryptionProvider {
  encrypt(plaintext: string): Promise<{ ciphertext: string; keyId: string }>;
  decrypt(input: { ciphertext: string; keyId: string }): Promise<string>;
}

export interface SnappShopMongooseOptions {
  connection: Connection;
  encryption: EncryptionProvider;
  modelPrefix?: string;
  collectionPrefix?: string;
}

export interface SnappShopAccountDocument {
  accountId: string;
  clientCode: string;
  encryptedToken: string;
  keyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SnappShopMappingDocument {
  accountId: string;
  vendorId: string;
  scopeId?: string;
  localId: string;
  snappShopProductId: string;
  sku: string;
}

export interface SnappShopCheckpointDocument {
  accountId: string;
  vendorId: string;
  kind: 'orders';
  cursor?: string;
  revision: number;
}

export function createSnappShopModels(options: SnappShopMongooseOptions) {
  const modelPrefix = options.modelPrefix ?? 'SnappShop';
  const collectionPrefix = options.collectionPrefix ?? 'snappshop_';
  const accountSchema = new Schema<SnappShopAccountDocument>(
    {
      accountId: { type: String, required: true, immutable: true },
      clientCode: { type: String, required: true },
      encryptedToken: { type: String, required: true, select: false },
      keyId: { type: String, required: true, select: false },
    },
    { timestamps: true, collection: `${collectionPrefix}accounts` },
  );
  accountSchema.index({ accountId: 1 }, { unique: true });
  for (const mode of ['toJSON', 'toObject'] as const) {
    accountSchema.set(mode, {
      transform(_document, returned) {
        const safe = returned as unknown as Record<string, unknown>;
        delete safe.encryptedToken;
        delete safe.keyId;
        return safe;
      },
    });
  }

  const mappingSchema = new Schema<SnappShopMappingDocument>(
    {
      accountId: { type: String, required: true },
      vendorId: { type: String, required: true },
      scopeId: { type: String },
      localId: { type: String, required: true },
      snappShopProductId: { type: String, required: true },
      sku: { type: String, required: true },
    },
    { timestamps: true, collection: `${collectionPrefix}mappings` },
  );
  mappingSchema.index({ accountId: 1, vendorId: 1, scopeId: 1, localId: 1 }, { unique: true });
  mappingSchema.index(
    { accountId: 1, vendorId: 1, scopeId: 1, snappShopProductId: 1 },
    { unique: true },
  );
  mappingSchema.index({ accountId: 1, vendorId: 1, scopeId: 1, sku: 1 });

  const checkpointSchema = new Schema<SnappShopCheckpointDocument>(
    {
      accountId: { type: String, required: true },
      vendorId: { type: String, required: true },
      kind: { type: String, required: true, enum: ['orders'] },
      cursor: String,
      revision: { type: Number, required: true, default: 0 },
    },
    { timestamps: true, collection: `${collectionPrefix}checkpoints` },
  );
  checkpointSchema.index({ accountId: 1, vendorId: 1, kind: 1 }, { unique: true });

  const Account = getOrCreateModel<SnappShopAccountDocument>(
    options.connection,
    `${modelPrefix}Account`,
    accountSchema,
  );
  const Mapping = getOrCreateModel<SnappShopMappingDocument>(
    options.connection,
    `${modelPrefix}Mapping`,
    mappingSchema,
  );
  const Checkpoint = getOrCreateModel<SnappShopCheckpointDocument>(
    options.connection,
    `${modelPrefix}Checkpoint`,
    checkpointSchema,
  );

  return {
    Account,
    Mapping,
    Checkpoint,
    async storeAccount(input: { accountId: string; clientCode: string; token: string }) {
      const validated = z
        .object({
          accountId: z.string().min(1),
          clientCode: z.string().min(1),
          token: z.string().min(1),
        })
        .strict()
        .parse(input);
      const encrypted = await options.encryption.encrypt(validated.token);
      return Account.findOneAndUpdate(
        { accountId: validated.accountId },
        {
          $set: {
            clientCode: validated.clientCode,
            encryptedToken: encrypted.ciphertext,
            keyId: encrypted.keyId,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    },
    async loadCredentials(accountId: string) {
      const id = z.string().min(1).parse(accountId);
      const account = await Account.findOne({ accountId: id })
        .select('+encryptedToken +keyId')
        .lean();
      if (!account) return null;
      const token = await options.encryption.decrypt({
        ciphertext: account.encryptedToken,
        keyId: account.keyId,
      });
      return { token, clientCode: account.clientCode };
    },
    async findUniqueMapping(input: {
      accountId: string;
      vendorId: string;
      scopeId?: string;
      sku: string;
    }) {
      const query = z
        .object({
          accountId: z.string().min(1),
          vendorId: z.string().min(1),
          scopeId: z.string().min(1).optional(),
          sku: z.string().min(1),
        })
        .strict()
        .parse(input);
      const filter = {
        accountId: query.accountId,
        vendorId: query.vendorId,
        sku: query.sku,
        ...(query.scopeId === undefined ? {} : { scopeId: query.scopeId }),
      };
      const rows = await Mapping.find(filter).limit(2).lean();
      if (rows.length > 1) {
        throw new SnappShopMappingAmbiguityError(`Multiple mappings found for SKU ${query.sku}`);
      }
      return rows[0] ?? null;
    },
    async advanceOrderCheckpoint(input: {
      accountId: string;
      vendorId: string;
      cursor: string;
      expectedRevision: number;
    }) {
      const value = z
        .object({
          accountId: z.string().min(1),
          vendorId: z.string().min(1),
          cursor: z.string().min(1),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict()
        .parse(input);
      return Checkpoint.findOneAndUpdate(
        {
          accountId: value.accountId,
          vendorId: value.vendorId,
          kind: 'orders',
          revision: value.expectedRevision,
        },
        { $set: { cursor: value.cursor }, $inc: { revision: 1 } },
        { new: true, runValidators: true },
      );
    },
  };
}

function getOrCreateModel<T>(connection: Connection, name: string, schema: Schema<T>): Model<T> {
  const existing = connection.models[name] as Model<T> | undefined;
  if (existing) {
    if (existing.collection.name !== schema.get('collection')) {
      throw new Error(`Mongoose model ${name} is already registered for another collection`);
    }
    return existing;
  }
  return connection.model<T>(name, schema);
}
