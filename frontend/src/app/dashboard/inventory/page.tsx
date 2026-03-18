"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Download } from "lucide-react";
import { toast } from "sonner";
import {
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  getVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseReports,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from "@/lib/api";

interface ExpenseCategory {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  is_active: boolean;
  expense_count: number;
  created_at: string;
  updated_at: string;
}

interface Vendor {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  gst_number: string;
  pan_number: string;
  payment_terms: string;
  is_active: boolean;
  expense_count: number;
  created_at: string;
  updated_at: string;
}

interface Expense {
  id: number;
  title: string;
  description: string;
  amount: number;
  date: string;
  payment_mode: string;
  payment_mode_display: string;
  reference_number: string;
  receipt: string;
  receipt_url: string;
  tags: string;
  is_recurring: boolean;
  recurring_interval: string;
  recurring_end_date: string;
  category: number;
  category_name: string;
  vendor: number;
  vendor_name: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Budget {
  id: number;
  academic_year: string;
  planned_amount: number;
  spent_amount: number;
  remaining_amount: number;
  utilization_percentage: number;
  status: string;
  alert_threshold_percentage: number;
  notes: string;
  category: number;
  category_name: string;
  created_at: string;
  updated_at: string;
}

interface ExpenseReport {
  total_expenses: number;
  total_income: number;
  net_profit: number;
  expense_by_category: Array<{
    category__name: string;
    total: number;
    count: number;
  }>;
  monthly_trends: Array<{
    month: string;
    income: number;
    expenses: number;
    profit: number;
  }>;
  top_vendors: Array<{
    vendor__name: string;
    total: number;
    count: number;
  }>;
  budget_comparison: Array<{
    category: string;
    budgeted: number;
    spent: number;
    remaining: number;
    utilization: number;
  }>;
  period: {
    start_date: string;
    end_date: string;
  };
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("expenses");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [reports, setReports] = useState<ExpenseReport | null>(null);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);

  // Form states
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  // Category form
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    color: "#6366f1",
    icon: "",
    is_active: true,
  });

  // Vendor form
  const [vendorForm, setVendorForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
    pan_number: "",
    payment_terms: "",
    is_active: true,
  });

  // Expense form
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    description: "",
    amount: "",
    date: new Date().toISOString().split('T')[0],
    payment_mode: "cash",
    reference_number: "",
    tags: "",
    is_recurring: false,
    recurring_interval: "",
    recurring_end_date: "",
    category: "",
    vendor: "none",
  });

  // Budget form
  const [budgetForm, setBudgetForm] = useState({
    academic_year: "2025-26",
    planned_amount: "",
    alert_threshold_percentage: 80,
    notes: "",
    category: "",
  });

  // Load data
  useEffect(() => {
    loadCategories();
    loadVendors();
    loadExpenses();
    loadBudgets();
    loadReports();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await getExpenseCategories();
      setCategories(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load expense categories:", error);
      toast.error("Failed to load expense categories");
      setCategories([]);
    }
  };

  const loadVendors = async () => {
    try {
      const response = await getVendors();
      setVendors(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load vendors:", error);
      toast.error("Failed to load vendors");
      setVendors([]);
    }
  };

  const loadExpenses = async () => {
    try {
      const response = await getExpenses();
      setExpenses(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load expenses:", error);
      toast.error("Failed to load expenses");
      setExpenses([]);
    }
  };

  const loadBudgets = async () => {
    try {
      const response = await getBudgets();
      setBudgets(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load budgets:", error);
      toast.error("Failed to load budgets");
      setBudgets([]);
    }
  };

  const loadReports = async () => {
    try {
      const response = await getExpenseReports();
      setReports(response.data || null);
    } catch (error) {
      console.error("Failed to load reports:", error);
      toast.error("Failed to load reports");
      setReports(null);
    }
  };

  // Category handlers
  const handleSaveCategory = async () => {
    try {
      setLoading(true);
      if (editingCategory) {
        await updateExpenseCategory(editingCategory.id, categoryForm);
        toast.success("Category updated successfully");
      } else {
        await createExpenseCategory(categoryForm);
        toast.success("Category created successfully");
      }
      setCategoryDialogOpen(false);
      resetCategoryForm();
      loadCategories();
    } catch (error) {
      toast.error("Failed to save category");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
      await deleteExpenseCategory(id);
      toast.success("Category deleted successfully");
      loadCategories();
    } catch (error) {
      toast.error("Failed to delete category");
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: "",
      description: "",
      color: "#6366f1",
      icon: "",
      is_active: true,
    });
    setEditingCategory(null);
  };

  // Vendor handlers
  const handleSaveVendor = async () => {
    try {
      setLoading(true);
      if (editingVendor) {
        await updateVendor(editingVendor.id, vendorForm);
        toast.success("Vendor updated successfully");
      } else {
        await createVendor(vendorForm);
        toast.success("Vendor created successfully");
      }
      setVendorDialogOpen(false);
      resetVendorForm();
      loadVendors();
    } catch (error) {
      toast.error("Failed to save vendor");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVendor = async (id: number) => {
    if (!confirm("Are you sure you want to delete this vendor?")) return;
    try {
      await deleteVendor(id);
      toast.success("Vendor deleted successfully");
      loadVendors();
    } catch (error) {
      toast.error("Failed to delete vendor");
    }
  };

  const resetVendorForm = () => {
    setVendorForm({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      gst_number: "",
      pan_number: "",
      payment_terms: "",
      is_active: true,
    });
    setEditingVendor(null);
  };

  // Expense handlers
  const handleSaveExpense = async () => {
    try {
      setLoading(true);
      const formData = {
        ...expenseForm,
        vendor: expenseForm.vendor === "none" ? null : expenseForm.vendor,
      };
      if (editingExpense) {
        await updateExpense(editingExpense.id, formData);
        toast.success("Expense updated successfully");
      } else {
        await createExpense(formData);
        toast.success("Expense created successfully");
      }
      setExpenseDialogOpen(false);
      resetExpenseForm();
      loadExpenses();
      loadReports();
    } catch (error) {
      toast.error("Failed to save expense");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      await deleteExpense(id);
      toast.success("Expense deleted successfully");
      loadExpenses();
      loadReports();
    } catch (error) {
      toast.error("Failed to delete expense");
    }
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      title: "",
      description: "",
      amount: "",
      date: new Date().toISOString().split('T')[0],
      payment_mode: "cash",
      reference_number: "",
      tags: "",
      is_recurring: false,
      recurring_interval: "",
      recurring_end_date: "",
      category: "",
      vendor: "none",
    });
    setEditingExpense(null);
  };

  // Budget handlers
  const handleSaveBudget = async () => {
    try {
      setLoading(true);
      if (editingBudget) {
        await updateBudget(editingBudget.id, budgetForm);
        toast.success("Budget updated successfully");
      } else {
        await createBudget(budgetForm);
        toast.success("Budget created successfully");
      }
      setBudgetDialogOpen(false);
      resetBudgetForm();
      loadBudgets();
    } catch (error) {
      toast.error("Failed to save budget");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBudget = async (id: number) => {
    if (!confirm("Are you sure you want to delete this budget?")) return;
    try {
      await deleteBudget(id);
      toast.success("Budget deleted successfully");
      loadBudgets();
    } catch (error) {
      toast.error("Failed to delete budget");
    }
  };

  const resetBudgetForm = () => {
    setBudgetForm({
      academic_year: "2025-26",
      planned_amount: "",
      alert_threshold_percentage: 80,
      notes: "",
      category: "",
    });
    setEditingBudget(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">Manage expenses, vendors, and track school profitability</p>
        </div>
      </div>

      {/* Summary Cards */}
      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{reports?.total_income?.toLocaleString() || '0'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">₹{reports?.total_expenses?.toLocaleString() || '0'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${reports?.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{reports?.net_profit?.toLocaleString() || '0'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Period</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {reports?.period?.start_date && reports?.period?.end_date 
                  ? `${new Date(reports.period.start_date).toLocaleDateString()} - ${new Date(reports.period.end_date).toLocaleDateString()}`
                  : 'Loading period data...'
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* Expenses Tab */}
        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Expenses</CardTitle>
                  <CardDescription>Manage and track all school expenses</CardDescription>
                </div>
                <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetExpenseForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Expense
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editingExpense ? "Edit Expense" : "Add New Expense"}</DialogTitle>
                      <DialogDescription>
                        Enter the expense details below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={expenseForm.title}
                          onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                          placeholder="Enter expense title"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={expenseForm.description}
                          onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                          placeholder="Enter expense description"
                        />
                      </div>
                      <div>
                        <Label htmlFor="amount">Amount</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={expenseForm.amount}
                          onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="date">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={expenseForm.date}
                          onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="payment_mode">Payment Mode</Label>
                        <Select value={expenseForm.payment_mode} onValueChange={(value) => setExpenseForm({ ...expenseForm, payment_mode: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="upi">UPI</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="reference_number">Reference Number</Label>
                        <Input
                          id="reference_number"
                          value={expenseForm.reference_number}
                          onChange={(e) => setExpenseForm({ ...expenseForm, reference_number: e.target.value })}
                          placeholder="Transaction ID, Cheque number, etc."
                        />
                      </div>
                      <div>
                        <Label htmlFor="category">Category</Label>
                        <Select value={expenseForm.category} onValueChange={(value) => setExpenseForm({ ...expenseForm, category: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories && categories.length > 0 ? (
                              categories.map((category) => (
                                <SelectItem key={category.id} value={category.id.toString()}>
                                  {category.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>No categories available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="vendor">Vendor</Label>
                        <Select value={expenseForm.vendor} onValueChange={(value) => setExpenseForm({ ...expenseForm, vendor: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No vendor</SelectItem>
                            {vendors && vendors.length > 0 ? (
                              vendors.map((vendor) => (
                                <SelectItem key={vendor.id} value={vendor.id.toString()}>
                                  {vendor.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>No vendors available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="tags">Tags</Label>
                        <Input
                          id="tags"
                          value={expenseForm.tags}
                          onChange={(e) => setExpenseForm({ ...expenseForm, tags: e.target.value })}
                          placeholder="Enter tags separated by commas"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveExpense} disabled={loading}>
                        {editingExpense ? "Update" : "Save"} Expense
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{expense.title}</div>
                          {expense.tags && (
                            <div className="flex gap-1 mt-1">
                              {expense.tags.split(',').map((tag, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {tag.trim()}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{expense.category_name || "-"}</TableCell>
                      <TableCell>{expense.vendor_name || "-"}</TableCell>
                      <TableCell className="font-medium">₹{expense.amount.toLocaleString()}</TableCell>
                      <TableCell>{new Date(expense.date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{expense.payment_mode_display}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingExpense(expense);
                              setExpenseForm({
                                title: expense.title,
                                description: expense.description,
                                amount: expense.amount.toString(),
                                date: expense.date,
                                payment_mode: expense.payment_mode,
                                reference_number: expense.reference_number,
                                tags: expense.tags,
                                is_recurring: expense.is_recurring,
                                recurring_interval: expense.recurring_interval,
                                recurring_end_date: expense.recurring_end_date,
                                category: expense.category.toString(),
                                vendor: expense.vendor?.toString() || "none",
                              });
                              setExpenseDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteExpense(expense.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Expense Categories</CardTitle>
                  <CardDescription>Manage expense categories for better organization</CardDescription>
                </div>
                <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetCategoryForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Category
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingCategory ? "Edit Category" : "Add New Category"}</DialogTitle>
                      <DialogDescription>
                        Create a new expense category for organizing expenses
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          value={categoryForm.name}
                          onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                          placeholder="Enter category name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={categoryForm.description}
                          onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                          placeholder="Enter category description"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="color">Color</Label>
                          <Input
                            id="color"
                            type="color"
                            value={categoryForm.color}
                            onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="icon">Icon</Label>
                          <Input
                            id="icon"
                            value={categoryForm.icon}
                            onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                            placeholder="Icon name (optional)"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveCategory} disabled={loading}>
                        {editingCategory ? "Update" : "Save"} Category
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories && categories.length > 0 ? (
                  categories.map((category) => (
                    <Card key={category.id} className="relative">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: category.color }}
                            />
                            <CardTitle className="text-lg">{category.name}</CardTitle>
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingCategory(category);
                                setCategoryForm({
                                  name: category.name,
                                  description: category.description,
                                  color: category.color,
                                  icon: category.icon,
                                  is_active: category.is_active,
                                });
                                setCategoryDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteCategory(category.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                        <div className="mt-2">
                          <Badge variant="secondary">{category.expense_count} expenses</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8">
                    <p className="text-muted-foreground">No categories found. Create your first expense category to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Vendors</CardTitle>
                  <CardDescription>Manage vendors and suppliers for your school</CardDescription>
                </div>
                <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetVendorForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Vendor
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
                      <DialogDescription>
                        Add a new vendor or supplier to your system
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label htmlFor="vendor_name">Vendor Name</Label>
                        <Input
                          id="vendor_name"
                          value={vendorForm.name}
                          onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                          placeholder="Enter vendor name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact_person">Contact Person</Label>
                        <Input
                          id="contact_person"
                          value={vendorForm.contact_person}
                          onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
                          placeholder="Contact person name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={vendorForm.phone}
                          onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                          placeholder="Phone number"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={vendorForm.email}
                          onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                          placeholder="Email address"
                        />
                      </div>
                      <div>
                        <Label htmlFor="gst_number">GST Number</Label>
                        <Input
                          id="gst_number"
                          value={vendorForm.gst_number}
                          onChange={(e) => setVendorForm({ ...vendorForm, gst_number: e.target.value })}
                          placeholder="GST number"
                        />
                      </div>
                      <div>
                        <Label htmlFor="pan_number">PAN Number</Label>
                        <Input
                          id="pan_number"
                          value={vendorForm.pan_number}
                          onChange={(e) => setVendorForm({ ...vendorForm, pan_number: e.target.value })}
                          placeholder="PAN number"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="address">Address</Label>
                        <Textarea
                          id="address"
                          value={vendorForm.address}
                          onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                          placeholder="Vendor address"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="payment_terms">Payment Terms</Label>
                        <Input
                          id="payment_terms"
                          value={vendorForm.payment_terms}
                          onChange={(e) => setVendorForm({ ...vendorForm, payment_terms: e.target.value })}
                          placeholder="e.g., Net 30 days"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveVendor} disabled={loading}>
                        {editingVendor ? "Update" : "Save"} Vendor
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendors && vendors.length > 0 ? (
                  vendors.map((vendor) => (
                    <Card key={vendor.id} className="relative">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{vendor.name}</CardTitle>
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingVendor(vendor);
                                setVendorForm({
                                  name: vendor.name,
                                  contact_person: vendor.contact_person,
                                  phone: vendor.phone,
                                  email: vendor.email,
                                  address: vendor.address,
                                  gst_number: vendor.gst_number,
                                  pan_number: vendor.pan_number,
                                  payment_terms: vendor.payment_terms,
                                  is_active: vendor.is_active,
                                });
                                setVendorDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteVendor(vendor.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {vendor.contact_person && <p><strong>Contact:</strong> {vendor.contact_person}</p>}
                          {vendor.phone && <p><strong>Phone:</strong> {vendor.phone}</p>}
                          {vendor.email && <p><strong>Email:</strong> {vendor.email}</p>}
                          {vendor.payment_terms && <p><strong>Terms:</strong> {vendor.payment_terms}</p>}
                        </div>
                        <div className="mt-2">
                          <Badge variant="secondary">{vendor.expense_count} expenses</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8">
                    <p className="text-muted-foreground">No vendors found. Add your first vendor to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budgets Tab */}
        <TabsContent value="budgets">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Budgets</CardTitle>
                  <CardDescription>Plan and track budgets for expense categories</CardDescription>
                </div>
                <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetBudgetForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Budget
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingBudget ? "Edit Budget" : "Add New Budget"}</DialogTitle>
                      <DialogDescription>
                        Set budget limits for expense categories
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="academic_year">Academic Year</Label>
                        <Input
                          id="academic_year"
                          value={budgetForm.academic_year}
                          onChange={(e) => setBudgetForm({ ...budgetForm, academic_year: e.target.value })}
                          placeholder="e.g., 2025-26"
                        />
                      </div>
                      <div>
                        <Label htmlFor="category">Category</Label>
                        <Select value={budgetForm.category} onValueChange={(value) => setBudgetForm({ ...budgetForm, category: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories && categories.length > 0 ? (
                              categories.map((category) => (
                                <SelectItem key={category.id} value={category.id.toString()}>
                                  {category.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>No categories available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="planned_amount">Planned Amount</Label>
                        <Input
                          id="planned_amount"
                          type="number"
                          value={budgetForm.planned_amount}
                          onChange={(e) => setBudgetForm({ ...budgetForm, planned_amount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="alert_threshold_percentage">Alert Threshold (%)</Label>
                        <Input
                          id="alert_threshold_percentage"
                          type="number"
                          min="0"
                          max="100"
                          value={budgetForm.alert_threshold_percentage}
                          onChange={(e) => setBudgetForm({ ...budgetForm, alert_threshold_percentage: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="budget_notes">Notes</Label>
                        <Textarea
                          id="budget_notes"
                          value={budgetForm.notes}
                          onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })}
                          placeholder="Additional notes about this budget"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveBudget} disabled={loading}>
                        {editingBudget ? "Update" : "Save"} Budget
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {budgets.map((budget) => (
                  <Card key={budget.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{budget.category_name}</CardTitle>
                          <CardDescription>{budget.academic_year}</CardDescription>
                        </div>
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingBudget(budget);
                              setBudgetForm({
                                academic_year: budget.academic_year,
                                planned_amount: budget.planned_amount.toString(),
                                alert_threshold_percentage: budget.alert_threshold_percentage,
                                notes: budget.notes,
                                category: budget.category.toString(),
                              });
                              setBudgetDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteBudget(budget.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Budgeted:</span>
                          <span className="font-medium">₹{budget.planned_amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Spent:</span>
                          <span className="font-medium">₹{budget.spent_amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Remaining:</span>
                          <span className={`font-medium ${budget.remaining_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{budget.remaining_amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Utilization:</span>
                            <span>{budget.utilization_percentage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                budget.status === 'exceeded' ? 'bg-red-600' :
                                budget.status === 'warning' ? 'bg-yellow-600' : 'bg-green-600'
                              }`}
                              style={{ width: `${Math.min(budget.utilization_percentage, 100)}%` }}
                            />
                          </div>
                          <Badge
                            variant={budget.status === 'exceeded' ? 'destructive' :
                                     budget.status === 'warning' ? 'secondary' : 'default'}
                            className="mt-1"
                          >
                            {budget.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <div className="space-y-6">
            {/* Expense by Category */}
            {reports && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Expense by Category</CardTitle>
                    <CardDescription>Breakdown of expenses by category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {reports?.expense_by_category?.length > 0 ? (
                        reports.expense_by_category.map((item, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-4 h-4 bg-blue-500 rounded" />
                              <span>{item.category__name}</span>
                              <Badge variant="secondary">{item.count} expenses</Badge>
                            </div>
                            <span className="font-medium">₹{item.total.toLocaleString()}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">No expense data available</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Monthly Trends */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Trends</CardTitle>
                    <CardDescription>Income vs expenses over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {reports?.monthly_trends?.length > 0 ? (
                        reports.monthly_trends.map((item, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>{item.month}</span>
                              <span className="font-medium">Profit: ₹{item.profit.toLocaleString()}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-green-600">Income: ₹{item.income.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-red-600">Expenses: ₹{item.expenses.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className={item.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {item.profit >= 0 ? 'Profit' : 'Loss'}: ₹{Math.abs(item.profit).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">No trend data available</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Vendors */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Vendors</CardTitle>
                    <CardDescription>Highest spending vendors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {reports?.top_vendors?.length > 0 ? (
                        reports.top_vendors.map((item, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div>
                              <span>{item.vendor__name}</span>
                              <Badge variant="secondary" className="ml-2">{item.count} expenses</Badge>
                            </div>
                            <span className="font-medium">₹{item.total.toLocaleString()}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">No vendor data available</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Budget Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle>Budget vs Actual</CardTitle>
                    <CardDescription>Compare planned budgets with actual spending</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {reports?.budget_comparison?.length > 0 ? (
                        reports.budget_comparison.map((item, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>{item.category}</span>
                              <span className="font-medium">{item.utilization.toFixed(1)}% utilized</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span>Budgeted: ₹{item.budgeted.toLocaleString()}</span>
                              </div>
                              <div>
                                <span>Spent: ₹{item.spent.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className={item.remaining >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  Remaining: ₹{item.remaining.toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  item.utilization >= 100 ? 'bg-red-600' :
                                  item.utilization >= 80 ? 'bg-yellow-600' : 'bg-green-600'
                                }`}
                                style={{ width: `${Math.min(item.utilization, 100)}%` }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">No budget data available</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
