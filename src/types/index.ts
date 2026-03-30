export interface Project {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: "woodworking" | "metalworking" | "mixed";
  tags: string[];
  images: string[];
  featured: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: string[];
  specs: Record<string, string>;
  stock: number;
  available: boolean;
  stripe_price_id: string;
  created_at: string;
}

export interface Booking {
  id: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
}

export interface Availability {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

export interface NewClientFormData {
  name: string;
  email: string;
  phone?: string;
  project_type: string;
  budget_range: string;
  timeline: string;
  description: string;
}
