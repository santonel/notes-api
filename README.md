# NOTES-API

Notes-api is a GraphQL service to managing taking notes, associating a language a source and tags.
It is written in typescript and uses various open source libraries, especially:

* [mikro-orm](https://github.com/mikro-orm/mikro-orm)
* [type-graphql](https://github.com/MichalLytek/type-graphql)
* [SQLite](https://www.sqlite.org/)

## 📑 Background

I wanted to give a try to the SQLite FTS5 extension and how easy would it be to use it with mikro-orm in a GraphQL api.

I ended up using a schema with [external content table](https://www.sqlite.org/fts5.html#external_content_tables) - the source of ispiration of this solution is from this great [video](https://www.youtube.com/watch?v=eXMA_2dEMO0) from James Moore.

## 🚀 Quick Start

If you are using visual studio code, just clone the repository and launch vscode in the repo directory. If you have the remote extension installed, it will offer to re-open it in devcontainer.

> If you are using Podman / Podman Desktop, select the podman container

Both devcontainers install two extensions: 
* biomejs.biome (formatting, linter)
* Orta.vscode-jest (tests)

The project require at least node 22:

```
npm install
```

Run the unit/integration tests with:

```
npm run test
```

Run the api with:

```
npm run start
```

## 👓 Examples 

Start the project and connect to localhost:4000/graphql. You can use apollo studio to execute query against the api.

Insert a note with:

```GraphQL
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

```Json
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

It is possible to associate tags with it:

```GraphQL

mutation AssociateTagsWithNote($associations: NoteAssociationInput!) {
  associateTagsWithNote(associations: $associations)
}

```

using these variables:

```Json
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

At this point it is possible to do a free text search.

> Under the hood, sqlite is using MATCH with title or body of the note

``` GraphQL
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

```Json
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
