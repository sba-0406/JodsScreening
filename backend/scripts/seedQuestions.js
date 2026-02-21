const mongoose = require('mongoose');
const Question = require('../models/Question');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Sample questions for 5 core skills (40 questions each = 200 total)
const questions = [
    // ========== PYTHON (40 questions) ==========
    {
        skill: 'Python',
        category: 'Backend',
        difficulty: 'Easy',
        question: 'What is the output of print(type([]))?',
        options: ['<class \'list\'>', '<class \'dict\'>', '<class \'tuple\'>', '<class \'set\'>'],
        correctAnswer: 0,
        explanation: 'Empty brackets [] create a list in Python'
    },
    {
        skill: 'Python',
        category: 'Backend',
        difficulty: 'Easy',
        question: 'Which keyword is used to define a function in Python?',
        options: ['function', 'def', 'func', 'define'],
        correctAnswer: 1,
        explanation: 'The def keyword is used to define functions in Python'
    },
    {
        skill: 'Python',
        category: 'Backend',
        difficulty: 'Medium',
        question: 'What is the purpose of Python decorators?',
        options: ['Add metadata to functions', 'Modify function behavior', 'Create class instances', 'Handle exceptions'],
        correctAnswer: 1,
        explanation: 'Decorators are used to modify the behavior of functions or classes'
    },
    {
        skill: 'Python',
        category: 'Backend',
        difficulty: 'Medium',
        question: 'What does the __init__ method do in a Python class?',
        options: ['Deletes the object', 'Initializes the object', 'Returns the object', 'Copies the object'],
        correctAnswer: 1,
        explanation: '__init__ is the constructor method that initializes new objects'
    },
    {
        skill: 'Python',
        category: 'Backend',
        difficulty: 'Hard',
        question: 'What is the difference between @staticmethod and @classmethod?',
        options: [
            'No difference',
            '@staticmethod receives class as first argument',
            '@classmethod receives class as first argument',
            'Both receive instance as first argument'
        ],
        correctAnswer: 2,
        explanation: '@classmethod receives the class (cls) as first argument, @staticmethod receives neither class nor instance'
    },

    // ========== SQL (40 questions) ==========
    {
        skill: 'SQL',
        category: 'Database',
        difficulty: 'Easy',
        question: 'Which SQL statement is used to retrieve data from a database?',
        options: ['GET', 'SELECT', 'RETRIEVE', 'FETCH'],
        correctAnswer: 1,
        explanation: 'SELECT is the SQL statement used to query and retrieve data'
    },
    {
        skill: 'SQL',
        category: 'Database',
        difficulty: 'Easy',
        question: 'What does the WHERE clause do in SQL?',
        options: ['Sorts results', 'Filters results', 'Groups results', 'Joins tables'],
        correctAnswer: 1,
        explanation: 'WHERE clause filters rows based on specified conditions'
    },
    {
        skill: 'SQL',
        category: 'Database',
        difficulty: 'Medium',
        question: 'What is the difference between INNER JOIN and LEFT JOIN?',
        options: [
            'No difference',
            'INNER JOIN returns all rows from left table',
            'LEFT JOIN returns all rows from left table',
            'LEFT JOIN is faster'
        ],
        correctAnswer: 2,
        explanation: 'LEFT JOIN returns all rows from the left table and matching rows from the right table'
    },
    {
        skill: 'SQL',
        category: 'Database',
        difficulty: 'Medium',
        question: 'What is a primary key?',
        options: [
            'A key that can be null',
            'A unique identifier for a row',
            'A foreign key reference',
            'An index for faster queries'
        ],
        correctAnswer: 1,
        explanation: 'A primary key uniquely identifies each row in a table and cannot be null'
    },
    {
        skill: 'SQL',
        category: 'Database',
        difficulty: 'Hard',
        question: 'What is the purpose of database indexing?',
        options: [
            'To store data',
            'To speed up data retrieval',
            'To enforce constraints',
            'To backup data'
        ],
        correctAnswer: 1,
        explanation: 'Indexes improve query performance by allowing faster data retrieval'
    },

    // ========== JAVASCRIPT (40 questions) ==========
    {
        skill: 'JavaScript',
        category: 'Frontend',
        difficulty: 'Easy',
        question: 'What is the correct way to declare a variable in JavaScript?',
        options: ['variable x = 5', 'let x = 5', 'var x := 5', 'int x = 5'],
        correctAnswer: 1,
        explanation: 'let is the modern way to declare variables in JavaScript'
    },
    {
        skill: 'JavaScript',
        category: 'Frontend',
        difficulty: 'Easy',
        question: 'What does === operator do?',
        options: [
            'Assigns a value',
            'Compares values only',
            'Compares values and types',
            'Checks if not equal'
        ],
        correctAnswer: 2,
        explanation: '=== is the strict equality operator that compares both value and type'
    },
    {
        skill: 'JavaScript',
        category: 'Frontend',
        difficulty: 'Medium',
        question: 'What is a closure in JavaScript?',
        options: [
            'A way to close a function',
            'A function with access to outer scope',
            'A type of loop',
            'A class method'
        ],
        correctAnswer: 1,
        explanation: 'A closure is a function that has access to variables in its outer scope'
    },
    {
        skill: 'JavaScript',
        category: 'Frontend',
        difficulty: 'Medium',
        question: 'What is the difference between null and undefined?',
        options: [
            'No difference',
            'null is assigned, undefined is default',
            'undefined is assigned, null is default',
            'Both are the same type'
        ],
        correctAnswer: 1,
        explanation: 'null is explicitly assigned, undefined is the default value for uninitialized variables'
    },
    {
        skill: 'JavaScript',
        category: 'Frontend',
        difficulty: 'Hard',
        question: 'What is event bubbling?',
        options: [
            'Events move from child to parent',
            'Events move from parent to child',
            'Events are cancelled',
            'Events are duplicated'
        ],
        correctAnswer: 0,
        explanation: 'Event bubbling is when events propagate from the target element up to its ancestors'
    },

    // ========== REACT (40 questions) ==========
    {
        skill: 'React',
        category: 'Frontend',
        difficulty: 'Easy',
        question: 'What is JSX?',
        options: [
            'A JavaScript library',
            'A syntax extension for JavaScript',
            'A CSS framework',
            'A database query language'
        ],
        correctAnswer: 1,
        explanation: 'JSX is a syntax extension that allows writing HTML-like code in JavaScript'
    },
    {
        skill: 'React',
        category: 'Frontend',
        difficulty: 'Easy',
        question: 'What hook is used to manage state in functional components?',
        options: ['useEffect', 'useState', 'useContext', 'useReducer'],
        correctAnswer: 1,
        explanation: 'useState is the hook for managing state in functional components'
    },
    {
        skill: 'React',
        category: 'Frontend',
        difficulty: 'Medium',
        question: 'What is the purpose of useEffect?',
        options: [
            'To manage state',
            'To handle side effects',
            'To create context',
            'To optimize performance'
        ],
        correctAnswer: 1,
        explanation: 'useEffect is used to handle side effects like data fetching, subscriptions, etc.'
    },
    {
        skill: 'React',
        category: 'Frontend',
        difficulty: 'Medium',
        question: 'What is prop drilling?',
        options: [
            'Passing props through multiple levels',
            'Drilling holes in components',
            'Optimizing props',
            'Validating props'
        ],
        correctAnswer: 0,
        explanation: 'Prop drilling is passing props through multiple component levels to reach a deeply nested component'
    },
    {
        skill: 'React',
        category: 'Frontend',
        difficulty: 'Hard',
        question: 'What is the virtual DOM?',
        options: [
            'A copy of the real DOM',
            'A lightweight representation of the DOM',
            'A database for DOM elements',
            'A CSS optimization technique'
        ],
        correctAnswer: 1,
        explanation: 'Virtual DOM is a lightweight JavaScript representation of the actual DOM for efficient updates'
    },

    // ========== NODE.JS (40 questions) ==========
    {
        skill: 'Node.js',
        category: 'Backend',
        difficulty: 'Easy',
        question: 'What is Node.js?',
        options: [
            'A JavaScript framework',
            'A JavaScript runtime',
            'A database',
            'A web server'
        ],
        correctAnswer: 1,
        explanation: 'Node.js is a JavaScript runtime built on Chrome\'s V8 engine'
    },
    {
        skill: 'Node.js',
        category: 'Backend',
        difficulty: 'Easy',
        question: 'Which module is used to create a web server in Node.js?',
        options: ['fs', 'http', 'path', 'url'],
        correctAnswer: 1,
        explanation: 'The http module is used to create web servers in Node.js'
    },
    {
        skill: 'Node.js',
        category: 'Backend',
        difficulty: 'Medium',
        question: 'What is the event loop in Node.js?',
        options: [
            'A for loop',
            'A mechanism for handling async operations',
            'A type of callback',
            'A debugging tool'
        ],
        correctAnswer: 1,
        explanation: 'The event loop handles asynchronous operations in Node.js'
    },
    {
        skill: 'Node.js',
        category: 'Backend',
        difficulty: 'Medium',
        question: 'What is middleware in Express.js?',
        options: [
            'A database layer',
            'Functions that execute during request-response cycle',
            'A routing mechanism',
            'A template engine'
        ],
        correctAnswer: 1,
        explanation: 'Middleware functions have access to request and response objects and execute during the request-response cycle'
    },
    {
        skill: 'Node.js',
        category: 'Backend',
        difficulty: 'Hard',
        question: 'What is the difference between process.nextTick() and setImmediate()?',
        options: [
            'No difference',
            'nextTick executes before I/O events',
            'setImmediate executes before I/O events',
            'Both are deprecated'
        ],
        correctAnswer: 1,
        explanation: 'process.nextTick() executes before the next event loop iteration, setImmediate() executes in the next iteration'
    }
];

// Generate more questions to reach 40 per skill (200 total)
// This is a simplified version - in production, you'd have all 200 unique questions
function generateAdditionalQuestions() {
    const skills = ['Python', 'SQL', 'JavaScript', 'React', 'Node.js'];
    const categories = {
        'Python': 'Backend',
        'SQL': 'Database',
        'JavaScript': 'Frontend',
        'React': 'Frontend',
        'Node.js': 'Backend'
    };
    const difficulties = ['Easy', 'Medium', 'Hard'];

    const additional = [];

    skills.forEach(skill => {
        const currentCount = questions.filter(q => q.skill === skill).length;
        const needed = 40 - currentCount;

        for (let i = 0; i < needed; i++) {
            const difficulty = difficulties[i % 3];
            additional.push({
                skill,
                category: categories[skill],
                difficulty,
                question: `${skill} ${difficulty} question ${i + 1}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: i % 4,
                explanation: `This is a ${difficulty.toLowerCase()} level ${skill} question`,
                tags: [skill, difficulty],
                createdBy: 'seed',
                status: 'active'
            });
        }
    });

    return additional;
}

async function seedQuestions() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Check if questions already exist
        const existing = await Question.countDocuments();
        if (existing > 0) {
            console.log(`✓ Question bank already has ${existing} questions`);
            console.log('  Skipping seed (delete existing questions first if you want to re-seed)');
            process.exit(0);
        }

        // Combine base questions with generated ones
        const allQuestions = [...questions, ...generateAdditionalQuestions()];

        // Add metadata to all questions
        const questionsWithMetadata = allQuestions.map(q => ({
            ...q,
            tags: q.tags || [q.skill, q.difficulty],
            createdBy: q.createdBy || 'seed',
            status: 'active',
            usageCount: 0
        }));

        // Insert questions
        await Question.insertMany(questionsWithMetadata);

        console.log(`✓ Successfully seeded ${questionsWithMetadata.length} questions!`);
        console.log('\nBreakdown by skill:');

        const skills = ['Python', 'SQL', 'JavaScript', 'React', 'Node.js'];
        for (const skill of skills) {
            const count = await Question.countDocuments({ skill });
            console.log(`  ${skill}: ${count} questions`);
        }

        console.log('\nBreakdown by difficulty:');
        const difficulties = ['Easy', 'Medium', 'Hard'];
        for (const difficulty of difficulties) {
            const count = await Question.countDocuments({ difficulty });
            console.log(`  ${difficulty}: ${count} questions`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error seeding questions:', error);
        process.exit(1);
    }
}

seedQuestions();
