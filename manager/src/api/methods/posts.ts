import { mainAlova } from "..";

export const fetchPostsMethod = (
	limit: number,
	page: number,
	order = "score",
) => {
	return mainAlova.Get("/posts.json", {
		params: {
			limit,
			page,
			order,
		},
	});
};

export const fetchPostByIdMethod = (postId: number) => {
	// Danbooru API endpoint for a single post
	return mainAlova.Get(`/posts/${postId}.json`);
};
