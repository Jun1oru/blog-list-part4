const _ = require('lodash');
const { test, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const supertest = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../app');
const api = supertest(app);

const helper = require('./test_helper');

const Blog = require('../models/blog');
const User = require('../models/user');

describe('all tests', () => {
  let token, user;
  beforeEach(async () => {
    await User.deleteMany({});

    const passwordHash = await bcrypt.hash('sekret', 10);
    user = new User({ username: 'anotherUser', passwordHash });
    await user.save();

    user = new User({ username: 'root', passwordHash });

    token = jwt.sign(
      {
        username: user.username,
        id: user._id,
      },
      process.env.SECRET
    );

    await Blog.deleteMany({});

    const blogs = _.map(helper.initialBlogs, (b) => {
      user.blogs = user.blogs.concat(b._id);

      return {
        ...b,
        user: user._id,
      };
    });

    await user.save();
    await Blog.insertMany(blogs);
  });

  describe('when there is initially some blogs saved', () => {
    test('blogs are returned as json', async () => {
      await api
        .get('/api/blogs')
        .expect(200)
        .expect('Content-Type', /application\/json/);
    });

    test('all blogs are returned', async () => {
      const response = await api.get('/api/blogs');

      assert.strictEqual(
        response.body.length,
        helper.initialBlogs.length
      );
    });

    test('property of blog posts is named id', async () => {
      const blogs = await helper.blogsInDb();
      const blog = blogs[0];

      const id = Object.hasOwn(blog, 'id');
      const _id = Object.hasOwn(blog, '_id');

      assert.strictEqual(id, true);
      assert.strictEqual(_id, false);
    });

    describe('addition of a new blog', () => {
      test('succeeds with valid data', async () => {
        const newBlog = {
          title: 'My blog',
          author: 'Me',
          url: 'https://localhost:3001/myblog',
          likes: 10,
        };

        await api
          .post('/api/blogs')
          .send(newBlog)
          .set('Authorization', `Bearer ${token}`)
          .expect(201)
          .expect('Content-Type', /application\/json/);

        const blogsAtEnd = await helper.blogsInDb();
        assert.strictEqual(
          blogsAtEnd.length,
          helper.initialBlogs.length + 1
        );

        const titles = _.map(blogsAtEnd, (b) => b.title);
        assert(_.includes(titles, 'My blog'));
      });

      test('likes property is mising; default to 0', async () => {
        const newBlog = {
          title: 'Test title',
          author: 'Test author',
          url: 'https://localhost:3001/test',
        };

        await api
          .post('/api/blogs')
          .send(newBlog)
          .set('Authorization', `Bearer ${token}`)
          .expect(201)
          .expect('Content-Type', /application\/json/);

        const blogsAtEnd = await helper.blogsInDb();
        const addedBlog = blogsAtEnd[blogsAtEnd.length - 1];

        assert.strictEqual(addedBlog.likes, 0);
      });

      describe('fails', () => {
        test('with status code 400 if title is missing', async () => {
          const newBlog = {
            author: 'Test author',
            url: 'https://localhost:3001',
            likes: 10,
          };

          await api
            .post('/api/blogs')
            .send(newBlog)
            .set('Authorization', `Bearer ${token}`)
            .expect(400);

          const blogsAtEnd = await helper.blogsInDb();

          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });

        test('with status code 400 if url is missing', async () => {
          const newBlog = {
            title: 'Test title',
            author: 'Test author',
            likes: 10,
          };

          await api
            .post('/api/blogs')
            .send(newBlog)
            .set('Authorization', `Bearer ${token}`)
            .expect(400);

          const blogsAtEnd = await helper.blogsInDb();

          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });

        test('with status code 400 if user is invalid', async () => {
          const newBlog = {
            title: 'My blog',
            author: 'Me',
            url: 'https://localhost:3001/myblog',
            likes: 10,
          };

          const invalidToken = jwt.sign(
            { username: 'invalid', id: '12401501' },
            process.env.SECRET
          );

          await api
            .post('/api/blogs')
            .send(newBlog)
            .set('Authorization', `Bearer ${invalidToken}`)
            .expect(400)
            .expect('Content-Type', /application\/json/);

          const blogsAtEnd = await helper.blogsInDb();
          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });

        test('with status code 401 if token is missing', async () => {
          const newBlog = {
            title: 'My blog',
            author: 'Me',
            url: 'https://localhost:3001/myblog',
            likes: 10,
          };

          const result = await api
            .post('/api/blogs')
            .send(newBlog)
            .expect(401)
            .expect('Content-Type', /application\/json/);

          assert(_.includes(result.body.error, 'token missing'));

          const blogsAtEnd = await helper.blogsInDb();
          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });
      });
    });

    describe('deletion of a blog', () => {
      test('succeeds if operation started by creator and id is valid', async () => {
        const blogToDelete = await Blog.findById(
          user.blogs[0].toString()
        );

        await api
          .delete(`/api/blogs/${blogToDelete.id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(204);

        const decodedToken = jwt.verify(token, process.env.SECRET);
        assert.strictEqual(decodedToken.id, user._id.toString());

        const blogsAtEnd = await helper.blogsInDb();

        assert.strictEqual(
          blogsAtEnd.length,
          helper.initialBlogs.length - 1
        );

        const titles = blogsAtEnd.map((b) => b.title);
        assert(!_.includes(titles, blogToDelete.title));
      });

      describe('fails', () => {
        test('with status code 400 if user is invalid', async () => {
          const blogToDelete = await Blog.findOne({});
          const invalidToken = jwt.sign(
            { username: 'invalid', id: '12401501' },
            process.env.SECRET
          );

          const result = await api
            .delete(`/api/blogs/${blogToDelete.id}`)
            .set('Authorization', `Bearer ${invalidToken}`)
            .expect(400)
            .expect('Content-Type', /application\/json/);

          const decodedToken = jwt.verify(
            invalidToken,
            process.env.SECRET
          );
          assert.notStrictEqual(
            decodedToken.id,
            blogToDelete.user.toString()
          );

          assert(_.includes(result.body.error, 'malformatted id'));

          const blogsAtEnd = await helper.blogsInDb();
          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });

        test('with status code 401 if user is not creator of blog', async () => {
          const blogToDelete = await Blog.findOne({});
          const testUser = await User.findOne({
            username: 'anotherUser',
          });
          const invalidToken = jwt.sign(
            { username: testUser.username, id: testUser.id },
            process.env.SECRET
          );

          const result = await api
            .delete(`/api/blogs/${blogToDelete.id}`)
            .set('Authorization', `Bearer ${invalidToken}`)
            .expect(401)
            .expect('Content-Type', /application\/json/);

          const decodedToken = jwt.verify(
            invalidToken,
            process.env.SECRET
          );
          assert.notStrictEqual(
            decodedToken.id,
            blogToDelete.user.toString()
          );

          assert(
            _.includes(
              result.body.error,
              'expected `logged user` to be creator of blog'
            )
          );

          const blogsAtEnd = await helper.blogsInDb();
          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });

        test('with status code 401 if token is missing', async () => {
          const blogToDelete = await Blog.findOne({});

          const result = await api
            .delete(`/api/blogs/${blogToDelete.id}`)
            .expect(401)
            .expect('Content-Type', /application\/json/);

          assert(_.includes(result.body.error, 'token missing'));

          const blogsAtEnd = await helper.blogsInDb();
          assert.strictEqual(
            blogsAtEnd.length,
            helper.initialBlogs.length
          );
        });
      });
    });

    describe('updating blog', () => {
      test('suceeds with status code 201 if id is valid', async () => {
        const blogsAtStart = await helper.blogsInDb();
        const blogToUpdate = blogsAtStart[0];

        const updateBlog = { ...blogToUpdate, likes: 154 };

        await api
          .put(`/api/blogs/${updateBlog.id}`)
          .send(updateBlog)
          .expect(201)
          .expect('Content-Type', /application\/json/);

        const blogsAtEnd = await helper.blogsInDb();
        assert.strictEqual(
          blogsAtEnd.length,
          helper.initialBlogs.length
        );

        const blogUpdated = blogsAtEnd.some((b) => {
          return b.likes === updateBlog.likes;
        });
        assert.strictEqual(blogUpdated, true);
      });

      /*test('fail with status code 400 if title is mising', async () => {
        const blogsAtStart = await helper.blogsInDb();
        const blogToUpdate = blogsAtStart[0];
  
        let { title: _, ...updateBlog } = blogToUpdate;
        updateBlog = { ...updateBlog, likes: 100 };
  
        await api
          .put(`/api/blogs/${updateBlog.id}`)
          .send(updateBlog)
          .expect(400);
  
        const blogsAtEnd = await helper.blogsInDb();
  
        assert.strictEqual(
          blogsAtEnd.length,
          helper.initialBlogs.length
        );
        assert.deepStrictEqual(blogsAtStart, blogsAtEnd);
      });*/
    });
  });

  describe('when there is initially one user in db', () => {
    beforeEach(async () => {
      await User.deleteMany({});

      const passwordHash = await bcrypt.hash('sekret', 10);
      user = new User({ username: 'root', passwordHash });

      await user.save();
    });

    describe('creating new user', () => {
      test('creation succeeds with valid data', async () => {
        const usersAtStart = await helper.usersInDb();

        const newUser = {
          username: 'mluukkai',
          name: 'Matti Luukkainen',
          password: 'salainen',
        };

        await api
          .post('/api/users')
          .send(newUser)
          .expect(201)
          .expect('Content-Type', /application\/json/);

        const usersAtEnd = await helper.usersInDb();
        assert.strictEqual(
          usersAtEnd.length,
          usersAtStart.length + 1
        );

        const usernames = usersAtEnd.map((u) => u.username);
        assert(usernames.includes(newUser.username));
      });

      describe('fail with status code 400 if', () => {
        test('username is already taken', async () => {
          const usersAtStart = await helper.usersInDb();

          const newUser = {
            username: 'root',
            name: 'Superuser',
            password: 'salainen',
          };

          const result = await api
            .post('/api/users')
            .send(newUser)
            .expect(400)
            .expect('Content-Type', /application\/json/);

          const usersAtEnd = await helper.usersInDb();
          assert(
            result.body.error.includes(
              'expected `username` to be unique'
            )
          );

          assert.strictEqual(usersAtEnd.length, usersAtStart.length);
        });

        test('username is missing', async () => {
          const usersAtStart = await helper.usersInDb();

          const newUser = {
            name: 'Superman',
            password: 'mypassword',
          };

          const result = await api
            .post('/api/users')
            .send(newUser)
            .expect(400);

          const usersAtEnd = await helper.usersInDb();
          assert(
            _.includes(
              result.body.error,
              'User validation failed: username: Path `username` is required.'
            )
          );

          assert.strictEqual(usersAtEnd.length, usersAtStart.length);
        });

        test('username is invalid', async () => {
          const usersAtStart = await helper.usersInDb();

          const newUser = {
            username: 'ro',
            name: 'Superman',
            password: 'mypassword',
          };

          const result = await api
            .post('/api/users')
            .send(newUser)
            .expect(400);

          const usersAtEnd = await helper.usersInDb();
          assert(
            _.includes(
              result.body.error,
              `User validation failed: username: Path \`username\` (\`${newUser.username}\`) is shorter than the minimum allowed length`
            )
          );

          assert.strictEqual(usersAtEnd.length, usersAtStart.length);
        });

        test('password is missing', async () => {
          const usersAtStart = await helper.usersInDb();

          const newUser = {
            username: 'rom',
            name: 'Romania',
          };

          const result = await api
            .post('/api/users')
            .send(newUser)
            .expect(400);

          const usersAtEnd = await helper.usersInDb();
          assert(
            _.includes(
              result.body.error,
              'User validation failed: password: Path `password` is required.'
            )
          );

          assert.strictEqual(usersAtEnd.length, usersAtStart.length);
        });

        test('password is invalid', async () => {
          const usersAtStart = await helper.usersInDb();

          const newUser = {
            username: 'rom',
            name: 'Romania',
            password: 'ab',
          };

          const result = await api
            .post('/api/users')
            .send(newUser)
            .expect(400);

          const usersAtEnd = await helper.usersInDb();
          assert(
            _.includes(
              result.body.error,
              `User validation failed: password: Path \`password\` (\`${newUser.password}\`) is shorter than the minimum allowed length`
            )
          );
          assert.strictEqual(usersAtEnd.length, usersAtStart.length);
        });
      });
    });
  });
});

after(async () => {
  await mongoose.connection.close();
});
