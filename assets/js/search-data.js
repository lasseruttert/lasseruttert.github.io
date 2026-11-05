// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "About",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-experience",
          title: "Experience",
          description: "Research positions and degrees.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/experience/";
          },
        },{id: "nav-publications",
          title: "Publications",
          description: "Papers and working notes.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/publications/";
          },
        },{id: "nav-projects",
          title: "Projects",
          description: "Research code, benchmarks and experiments.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-blog",
          title: "Blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-a-simple-inline-announcement",
          title: 'A simple inline announcement.',
          description: "",
          section: "News",},{id: "news-a-long-announcement-with-details",
          title: 'A long announcement with details',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
            },},{id: "news-a-simple-inline-announcement-with-markdown-emoji-sparkles-smile",
          title: 'A simple inline announcement with Markdown emoji! :sparkles: :smile:',
          description: "",
          section: "News",},{id: "projects-pdpbench-google-deepmind-measuring-progress-toward-agi",
          title: 'PDPBench: Google DeepMind, Measuring Progress Toward AGI',
          description: "A benchmark for frontier LLMs, in which they solve incrementally harder parts of Pickup and Delivery Problems with Time Windows. Part of the Google DeepMind Measuring Progress Toward AGI competition, Executive Functions track.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/PDPBench/";
            },},{id: "projects-tensortonic-solutions",
          title: 'TensorTonic Solutions',
          description: "Solutions to TensorTonic problems.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/TensorTonic-Solutions/";
            },},{id: "projects-clef-2026-touché",
          title: 'CLEF 2026: Touché',
          description: "Trained a joint DeBERTa-v3 encoder with task-specific heads to detect causal news sentences, extract the spans in the causal relationship, and classify span pairs as causal, countercausal, or uncausal.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/clef_2026_touche/";
            },},{id: "projects-ged-on-molecular-graphs",
          title: 'GED on Molecular Graphs',
          description: "Graph Edit Distance on molecular graphs.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/ged_on_molecular_graphs/";
            },},{id: "projects-kaggle-competitions",
          title: 'Kaggle Competitions',
          description: "NLP competitions on Kaggle for hands-on experience with BERT fine-tuning, LLM fine-tuning, and reward modelling.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/kaggle/";
            },},{id: "projects-rl-memetic-pdptw",
          title: 'RL Memetic PDPTW',
          description: "Bachelor thesis: RL picks the local-search operators of a memetic algorithm.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/rl-memetic-pdptw/";
            },},{id: "projects-semeval-2026-task-11",
          title: 'SemEval 2026: Task 11',
          description: "A two-stage pipeline: an LLM abstracts premises and conclusions into domain-independent logical forms, then the logical validity of the normalized form is classified. Built as part of an NLP course at the University of Bonn.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/semeval_2026_task11/";
            },},{id: "teachings-data-science-fundamentals",
          title: 'Data Science Fundamentals',
          description: "This course covers the foundational aspects of data science, including data collection, cleaning, analysis, and visualization. Students will learn practical skills for working with real-world datasets.",
          section: "Teachings",handler: () => {
              window.location.href = "/teachings/data-science-fundamentals/";
            },},{id: "teachings-introduction-to-machine-learning",
          title: 'Introduction to Machine Learning',
          description: "This course provides an introduction to machine learning concepts, algorithms, and applications. Students will learn about supervised and unsupervised learning, model evaluation, and practical implementations.",
          section: "Teachings",handler: () => {
              window.location.href = "/teachings/introduction-to-machine-learning/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6C%61%73%73%65.%72%75%74%74%65%72%74@%65%78%61%6D%70%6C%65.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/lasseruttert", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/lasse-ruttert", "_blank");
        },
      },{
        id: 'social-cv',
        title: 'CV',
        section: 'Socials',
        handler: () => {
          window.open("/assets/pdf/cv.pdf", "_blank");
        },
      },];
