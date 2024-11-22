const _ = require('lodash');
const middleware = require('../utils/middleware');
const blogsRouter = require('express').Router();
const Blog = require('../models/blog');
const User = require('../models/user');

blogsRouter.get('/', async (request, response) => {
  const blogs = await Blog.find({}).populate('user', {
    username: 1,
    name: 1,
  });
  response.json(blogs);
});

blogsRouter.get('/:id', async (request, response) => {
  const blog = await Blog.findById(request.params.id).populate(
    'user',
    {
      username: 1,
      name: 1,
    }
  );
  response.json(blog);
});

blogsRouter.post(
  '/',
  middleware.userExtractor,
  async (request, response) => {
    const body = request.body;
    const user = request.user;

    const blog = new Blog({
      title: body.title,
      author: body.author,
      url: body.url,
      likes: body.likes || 0,
      user: user._id,
      comments: [],
    });

    const savedBlog = await blog.save();

    user.blogs = user.blogs.concat(savedBlog._id);
    await user.save();

    const responseBlog = await Blog.findById(savedBlog._id).populate(
      'user',
      {
        username: 1,
        name: 1,
      }
    );
    response.status(201).json(responseBlog);
  }
);

blogsRouter.post('/:id/comments', async (request, response) => {
  const comment = request.body;
  const blog = await Blog.findById(request.params.id);

  blog.comments.push(comment);
  const savedBlog = await blog.save();
  const responseBlog = await Blog.findById(savedBlog._id).populate(
    'user',
    {
      username: 1,
      name: 1,
    }
  );
  response.status(201).json(responseBlog);
});

blogsRouter.delete(
  '/:id',
  middleware.userExtractor,
  async (request, response) => {
    const blog = await Blog.findById(request.params.id);
    const user = request.user;
    const creator = await User.findById(blog.user);

    if (user._id.toString() !== creator._id.toString()) {
      return response.status(401).json({
        error: 'expected `logged user` to be creator of blog',
      });
    }

    await blog.deleteOne();

    creator.blogs = _.filter(
      creator.blogs,
      (b) => b._id.toString() !== blog._id.toString()
    );
    await creator.save();

    response.status(204).end();
  }
);

blogsRouter.put('/:id', async (request, response) => {
  const body = request.body;

  const blog = {
    title: body.title,
    author: body.author,
    url: body.url,
    likes: body.likes,
    user: body.user,
    comments: body.comments,
  };

  const updatedBlog = await Blog.findByIdAndUpdate(
    request.params.id,
    blog,
    {
      new: true,
    }
  ).populate('user', {
    username: 1,
    name: 1,
  });
  response.status(201).json(updatedBlog);
});

module.exports = blogsRouter;
