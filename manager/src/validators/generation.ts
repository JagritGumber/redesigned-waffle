import { Type, Static } from "@sinclair/typebox";

export const GeneratorParams = Type.Object({
  modelId: Type.Number(),
  modelVersionId: Type.Number(),
  weight: Type.Number({
    exclusiveMinimum: 0,
    maximum: 1,
  }),
});

export const GenerateRequestPayload = Type.Object({
  checkpoint: GeneratorParams,
  loras: Type.Array(GeneratorParams),
  textualInversions: Type.Array(
    Type.Intersect([
      GeneratorParams,
      Type.Object({
        type: Type.Union([Type.Literal("negative"), Type.Literal("positive")]),
      }),
    ])
  ),
  numImages: Type.Number({
    minimum: 1,
    maximum: 8,
  }),
  prompt: Type.String(),
  negativePrompt: Type.String(),
  width: Type.Number({
    minimum: 2,
  }),
  height: Type.Number({
    minimum: 2,
  }),
  steps: Type.Number({
    minimum: 1,
  }),
  seed: Type.Number(),
});

export type GenerateRequestPayloadType = Static<typeof GenerateRequestPayload>;

export const GeneratePromptRequestPayload = Type.Object({
  prompt: Type.String(),
});

export type GeneratePromptRequestPayloadType = Static<typeof GeneratePromptRequestPayload>;
