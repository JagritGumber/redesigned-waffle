import db from "@/db";
import type { SelectCategory } from "@/schema";

const CategoriesService = {
  async getCategories(parentId: SelectCategory["parentId"]) {
    try {
      const categoriesOrNull = await db.query.categories.findMany({
        where: (category, { eq, isNull }) =>
          parentId ? eq(category.parentId, parentId) : isNull(category.parentId),
      });
      return categoriesOrNull;
    } catch (e) {
      console.error("Unexpected error occurred while trying to get categories");
      console.error(e);
      return null;
    }
  },

  async getCategoryById(categoryId: SelectCategory["id"]) {
    try {
      const categoryOrNull = await db.query.categories.findFirst({
        where: (category, { eq }) => eq(category.id, categoryId),
      });
      return categoryOrNull;
    } catch (e) {
      return null;
    }
  },
};

export default CategoriesService;
