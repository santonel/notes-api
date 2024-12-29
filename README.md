# NOTES-API

Notes-api is a GraphQL service for managing notes, associating them with a language, a source, and tags.  
It is written in TypeScript and uses various open-source libraries, including:

* [mikro-orm](https://github.com/mikro-orm/mikro-orm)  
* [type-graphql](https://github.com/MichalLytek/type-graphql)  
* [SQLite](https://www.sqlite.org/)

## 📑 Background

I wanted to try the SQLite FTS5 extension and explore how easy it would be to use it with mikro-orm in a GraphQL API.

I ended up using a schema with an [external content table](https://www.sqlite.org/fts5.html#external_content_tables). The inspiration for this solution came from this great [video](https://www.youtube.com/watch?v=eXMA_2dEMO0) by James Moore.

## 🚀 Quick Start

If you are using Visual Studio Code, clone the repository and launch VS Code in the repository directory. If you have the Remote extension installed, it will offer to re-open the project in a devcontainer.

> If you are using Podman/Podman Desktop, select the Podman container.

Both devcontainers install two extensions:  
* biomejs.biome (formatting, linter)  
* Orta.vscode-jest (tests)

The project requires at least Node.js 22:

```bash
npm install
```

Run the unit/integration tests with:

```bash
npm run test
```

Run the API with:

```bash
npm run start
```

## 👓 Examples 

Edit the example.env file with your preferred options. You can leave it as-is, but VS Code will use development.env as the default environment file.

Start the project and connect to localhost:4000/graphql. You can use Apollo Studio to execute queries against the API.

Insert a note with:

```graqphql
mutation SaveNote($data: NoteInput!) {
  saveNote(data: $data) {
    title
    body
    date
    internalId
    languageId
    noteId
    sourceId
  }
}
```

using these variables:

```json
{
  "data": {
    "internalId": "MATH-001",
    "title": "Geometry lesson 1",
    "body": "In a Euclidean space, the sum of angles of a triangle equals a straight angle",
    "date": "2018-06-01T13:20:00Z",
    "languageId": 1,
    "sourceId": 1,
  }
}
```

You can associate tags with it:

```graqphql

mutation AssociateTagsWithNote($associations: NoteAssociationInput!) {
  associateTagsWithNote(associations: $associations)
}

```

using these variables:

```json
{
  "associations": {
    "noteId": 1,
    "tags": [
      {
        "displayOrder": 1,
        "tagId": 1
      }
    ]
  }
}
```

At this point, you can perform a free-text search.

> Under the hood, sqlite uses MATCH to search the title or body of the note.

``` graqphql
query searchNotes($pagination: PaginationInput!, $searchInput: SearchNotesInput!, $sortInput: NoteMultiSortInput) {
  searchNotes(pagination: $pagination, searchInput: $searchInput, sortInput: $sortInput) {
    hasNextPage
    items {
      noteId
      title
      body
      date
      language {
        name
      }
      source {
        name
      }
      tags {
        tag {
          name
        }
      }
    }
  }
}

```

using these variables:

```json
{

  "searchInput": {
    "fromDate": "2018-01-01T00:00:00Z",
    "toDate": "2018-12-31T00:00:00Z",
    "searchPhrase": "triangle"
  },
  "sortInput": {
    "sorts": [
      {
        "sort": "asc",
        "field": "date"
      }
    ]
  },
    "pagination": {
    "limit": 10,
    "offset": 0
  },
}
```

     
## 🤝 Feedback and Contributions

I'd love to hear your feedback and suggestions for further improvements. Feel free to contribute!
