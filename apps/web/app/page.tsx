export default function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 0' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Welcome to Royal Recipes</h1>
      <p style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)', marginBottom: '3rem' }}>
        Discover authentic Indian cuisines, seamlessly plan your budget, and auto-generate grocery lists tailored just for you.
      </p>
      
      <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href="/catalog" className="card" style={{ width: '300px', textDecoration: 'none', color: 'inherit' }}>
          <h3>Browse Catalog</h3>
          <p style={{ marginTop: '1rem' }}>Explore 6000+ Indian recipes categorized by region and diet.</p>
        </a>
        
        <a href="/bot" className="card" style={{ width: '300px', textDecoration: 'none', color: 'inherit' }}>
          <h3>Recipe Bot</h3>
          <p style={{ marginTop: '1rem' }}>Ask our Groq-powered AI for a recipe and we'll instantly turn it into a shoppable cart.</p>
        </a>

        <a href="/planners" className="card" style={{ width: '300px', textDecoration: 'none', color: 'inherit' }}>
          <h3>Smart Planners</h3>
          <p style={{ marginTop: '1rem' }}>Set your budget and dietary preferences to get a fully curated weekly meal plan.</p>
        </a>
      </div>
      
      <div style={{ marginTop: '4rem' }}>
        <button className="btn-primary">Start Your Culinary Journey</button>
      </div>
    </div>
  );
}
