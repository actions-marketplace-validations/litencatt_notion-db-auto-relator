import { Client, LogLevel } from "@notionhq/client"
import { GetDatabaseResponse } from "@notionhq/client/build/src/api-endpoints";
import { PropertyValueTitle, PropertyValueMultiSelect } from "@notion-stuff/v4-types"
import dotenv from "dotenv"

// defile self types
type MultiSelectProperty = Extract<GetDatabaseResponse["properties"][string], { type: "multi_select" }>;

dotenv.config()

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
//  logLevel: LogLevel.DEBUG,
})

// Hosting Task DB ID
const parentDbId = process.env.PARENT_DB_ID as string
const childDbId = process.env.CHILD_DB_ID as string
const parentDbRelationColumnName = 'Relation'
const tagColumnName = 'Tags'

relateParentDbToChildDb()

async function relateParentDbToChildDb() {
  const parentPages = await getParentDbTags(parentDbId, tagColumnName)
  for (const parentPage of parentPages) {
    const childPages = await searchDbPagesWithTag(childDbId, tagColumnName, parentPage.tag)
    // @ts-ignore
    const childPageIds = []
    for (const childPageId of childPages.pageIds) {
      childPageIds.push({'id': childPageId})
    }
    //console.log(childPageIds)
    await updateRelation(parentPage.pageId, childPageIds, parentDbRelationColumnName)
  }
}

async function getDbMultiSelect(databaseId:string, column:string) : Promise<string[]> {
  const res = await notion.databases.retrieve({
    database_id: databaseId,
  })
  // console.log(res.properties)
  const ms = res.properties[column] as MultiSelectProperty
  const multiSelectTags = ms.multi_select.options.map(o => o.name)
  console.log(multiSelectTags)

  return multiSelectTags
}

async function getParentDbTags(databaseId: string, columnName: string) :Promise<any> {
  const res = await notion.databases.query({
    database_id: databaseId,
  })
  const pages: any = []
  res.results.map(page => {
    const ms = page.properties[columnName] as PropertyValueMultiSelect
    const tagName = ms.multi_select.map(e => e.name)[0]
    pages.push({
      tag: tagName,
      pageId: page.id
    })
  })
  console.log(pages)
  return pages
}

async function searchDbPagesWithTag(databaseId: string, columnName: string, tag: string) : Promise<any> {
  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      or: [
        {
          property: columnName,
          multi_select: {
            contains: tag
          }
        }
      ]
    }
  })

  let pages:any = {
    tag: tag,
    pageIds: []
  }
  res.results.map(page => {
    const name = page.properties.Name as PropertyValueTitle
    //console.log(`tag:${tag}, name:${name.title.map(t => t.plain_text)}, pageId:${page.id}`)
    pages.pageIds.push(page.id)
  })
  console.log(pages)

  return pages
}

// @ts-ignore
async function updateRelation(parentId: string, childIds: any[], relateColumnName: string) {
  console.log(relateColumnName)
  await notion.pages.update({
    page_id: parentId,
    properties: {      
      [relateColumnName]: {
        type: 'relation',
        'relation': childIds
      }
    }
  })
}