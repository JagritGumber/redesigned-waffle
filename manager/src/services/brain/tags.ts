import db from "@/db";
import type { SelectCategory, SelectTag } from "@/schema";

const TagService = {
  async getTagsForCategory(categoryId: SelectCategory["id"]): Promise<SelectTag[]> {
    try {
      const selectedTags = await db.query.categoryTag.findMany({
        where: (categoryTag, { eq }) => eq(categoryTag.categoryId, categoryId),
        with: {
          tag: true,
        },
      });
      return selectedTags.map(({ tag }) => tag);
    } catch (e) {
      console.error("Some random error while trying to get tags for category", { e });
      return [];
    }
  },

  async getRelationshipWeightsForTargetTag(tagId: number, sourceCategoryIds: number[]) {
    if (sourceCategoryIds.length === 0) {
      return []; // Cannot use IN with empty array
    }
    try {
      const result = await db.query.relationshipWeights.findMany({
        where: (relWeights, { eq, and, inArray }) =>
          and(
            eq(relWeights.targetTagId, tagId),
            inArray(relWeights.sourceCategoryId, sourceCategoryIds),
          ),
      });
      return result;
    } catch (error) {
      console.error(
        `Error fetching relationship weights for tag ${tagId} from sources ${sourceCategoryIds}:`,
        error,
      );
      return [];
    }
  },
};

export default TagService;
