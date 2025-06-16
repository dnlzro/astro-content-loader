import { RuleConfigSeverity, type UserConfig } from "@commitlint/types";
import conventional from "@commitlint/config-conventional";

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      RuleConfigSeverity.Error,
      "always",
      [...conventional.rules["type-enum"][2], "metadata"],
    ],
  },
} satisfies UserConfig;
