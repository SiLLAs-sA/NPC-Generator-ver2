import Dexie, { type Table } from 'dexie';
import { NPC, ArchiveNPC } from './types';

export class NPCDatabase extends Dexie {
  npcs!: Table<ArchiveNPC>;

  constructor() {
    super('NPCDatabase');
    this.version(1).stores({
      npcs: '++id, name, style, createdAt'
    });
  }
}

export const db = new NPCDatabase();
