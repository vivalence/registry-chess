import { types, EntitySchema, type Opt, type Rel } from "@mikro-orm/core";
import { DataEntity, DataSchema } from "@vivalence/runtime";
import { UserEntity, ModeEntity, ThreadEntity } from "@vivalence/runtime";
import { LiteralEntity } from "../kernel/Literal.ts";

// one attempt at a puzzle, one sealed match — what a user did with a literal, when. the riddle
// mode reads its streaks off these; a rating driver folds them later.
export class TraceEntity extends DataEntity {
  user!: Rel<UserEntity>;
  literal?: Rel<LiteralEntity>;
  mode?: Rel<ModeEntity>;
  thread?: Rel<ThreadEntity>;

  kind!: string & Opt;
  signal: any & Opt = {};
  status!: string & Opt;
  snapshot: any & Opt = {};
}

export const TraceSchema = new EntitySchema<TraceEntity, DataEntity>({
  class: TraceEntity,
  extends: DataSchema,
  tableName: "Trace",
  filters: {
    user: {
      cond: (args: any) => ({ user: args.user }),
      default: true,
    },
  },
  properties: {
    user: { kind: "m:1", entity: () => UserEntity, fieldName: "user", updateRule: "cascade", deleteRule: "cascade" },
    literal: { kind: "m:1", entity: () => LiteralEntity, fieldName: "literal", nullable: true, deleteRule: "set null" },
    mode: { kind: "m:1", entity: () => ModeEntity, fieldName: "mode", nullable: true },
    thread: { kind: "m:1", entity: () => ThreadEntity, fieldName: "thread", nullable: true },

    kind: { type: types.string },
    signal: { type: types.json },
    status: { type: types.string },
    snapshot: { type: types.json },
  },
});

export default {
  type: "trace",
  schema: TraceSchema,
  entity: TraceEntity,
};
