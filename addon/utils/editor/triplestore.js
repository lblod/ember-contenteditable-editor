import { analyse as scanContexts } from '@lblod/marawa/rdfa-context-scanner';

function triplesDefinedInResource( resourceUri ){
  let domNodes = scanContexts(this.rootNode).filter( c => c.context.slice(-1)[0].subject === resourceUri ).map( c => c.semanticNode.domNode );

  let contexts = domNodes.reduce((acc, d) => {
    return [...acc, ...scanContexts(d)];
  }, []);

  let triples = contexts.reduce((acc, d) => {
    return [...acc, ...d.context];
  }, []);

  //Get unique values
  let triplesHash = triples.reduce( (acc, t) => {
    acc[JSON.stringify(sortedTripleObject(t))] = t;
    return acc;
  }, {});

  return Object.values(triplesHash);
}

function sortedTripleObject(triple){
  return Object.keys(triple).sort().reduce((acc, k) => {
    acc[k] = triple[k];
    return acc;
  } , {});
}

export { triplesDefinedInResource }
