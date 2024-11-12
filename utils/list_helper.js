const _ = require('lodash');

const dummy = (blogs) => {
  return 1;
};

const totalLikes = (blogs) => {
  return blogs.reduce((sum, blog) => sum + blog.likes, 0);
};

const favoriteBlog = (blogs) => {
  return blogs.reduce((acc, blog) => {
    if (acc === null || blog.likes > acc.likes) return blog;
    return acc;
  }, null);
};

const mostBlogs = (blogs) => {
  if (_.isEmpty(blogs)) return null;

  const result = _.chain(blogs)
    .groupBy('author')
    .map((authorBlogs, author) => ({
      author: author,
      blogs: authorBlogs.length,
    }))
    .maxBy('blogs')
    .value();

  return result;
};

const mostLikes = (blogs) => {
  if (_.isEmpty(blogs)) return null;

  const result = _.chain(blogs)
    .groupBy('author')
    .map((authorBlogs, author) => ({
      author: author,
      likes: _.sumBy(authorBlogs, 'likes'),
    }))
    .maxBy('likes')
    .value();

  return result;
};

module.exports = {
  dummy,
  totalLikes,
  favoriteBlog,
  mostBlogs,
  mostLikes,
};
